import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail, ThrottlerRequest } from '@nestjs/throttler';
import type { Request } from 'express';

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

    let limit: number;
    switch (role) {
      case 'admin':
      case 'finance':
      case 'compliance':
      case 'support':
        limit = 600;
        break;
      case 'vendor':
        limit = 300;
        break;
      case 'customer':
        limit = 120;
        break;
      default:
        // Anonymous: keep the configured default for the 'short' throttler
        // (burst protection) and tighten the long window.
        limit = throttler.name === 'short' ? (throttler.limit as number) : 30;
    }

    return super.handleRequest({
      ...requestProps,
      throttler: { ...throttler, limit },
    });
  }

  /**
   * Standard 429 response; preserve any custom error wiring downstream.
   */
  protected throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
