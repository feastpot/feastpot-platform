import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail, ThrottlerRequest } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import type { AuthUser } from '../../auth/types';

/**
 * Role-aware rate limiting:
 *   - Admin / finance / compliance / support : 600 req/min  (ops dashboards)
 *   - Vendor                                  : 300 req/min  (live polling)
 *   - Customer                                : 120 req/min
 *   - Unauthenticated                          : 30  req/min
 *
 * The two named throttlers from `app.module.ts` ('short' = 10/sec, 'long' =
 * 300/min) provide burst protection and a sane default; this guard
 * additionally raises the long-window limit for trusted roles.
 *
 * Tracker: authenticated users are tracked by `userId` (not IP), so a vendor
 * behind a shared NAT can't be throttled by other tenants' traffic and an
 * attacker can't bypass limits by spoofing X-Forwarded-For.
 */
@Injectable()
export class RoleThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    const user = (req as Request & { user?: AuthUser }).user;
    if (user?.id) return Promise.resolve(`user:${user.id}`);
    // Fallback to IP (Express's `trust proxy` is set in main.ts so req.ip is
    // the real client IP, not the load balancer).
    return Promise.resolve(`ip:${req.ip ?? 'unknown'}`);
  }

  /**
   * Override the per-request limit based on the authenticated role. The
   * tracker key is namespaced (`user:` vs `ip:`) so a single user's bucket
   * is isolated from anonymous traffic from the same IP.
   */
  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, throttler } = requestProps;
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const role = req.user?.role;

    let roleCap: number;
    switch (role) {
      case 'admin':
      case 'finance':
      case 'compliance':
      case 'support':
        roleCap = 600;
        break;
      case 'vendor':
        roleCap = 300;
        break;
      case 'customer':
        roleCap = 120;
        break;
      default:
        // Anonymous: keep the configured default for the 'short' throttler
        // (burst protection) and tighten the long window.
        roleCap = throttler.name === 'short' ? (throttler.limit as number) : 30;
    }

    // CRITICAL: take the MIN of the role cap and whatever the route asked
    // for via @Throttle({...}). Without this, a route-level tightening
    // (e.g. discount-code validation @Throttle({ long: { limit: 10 } })
    // for anti-enumeration) gets silently relaxed back up to the role cap
    // (30 anon / 120 customer / …), defeating the security intent.
    // Route-level looser limits are still capped by the role ceiling.
    const routeLimit = throttler.limit as number;
    const limit = Math.min(roleCap, routeLimit);

    return super.handleRequest({
      ...requestProps,
      throttler: { ...throttler, limit },
    });
  }

  /**
   * @nestjs/throttler v6 sets per-throttler `Retry-After-{name}` headers (e.g.
   * `Retry-After-short`) but never the canonical `Retry-After`. Set it here from
   * the real seconds-until-unblock so HTTP clients get a standard header and
   * ThrottlerExceptionFilter can echo an accurate `retryAfter` into the JSON
   * body instead of guessing.
   */
  protected throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const res = context.switchToHttp().getResponse<Response>();
    res.header('Retry-After', `${throttlerLimitDetail.timeToBlockExpire}`);
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
