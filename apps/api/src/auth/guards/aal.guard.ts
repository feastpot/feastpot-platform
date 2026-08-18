import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../types';

/**
 * Staff roles that must present aal2 when ADMIN_REQUIRE_AAL2=true.
 * Customer and vendor tokens are never subject to this check.
 */
const STAFF_ROLES = new Set<UserRole>([
  UserRole.admin,
  UserRole.support,
  UserRole.finance,
  UserRole.compliance,
]);

/**
 * AAL (Authenticator Assurance Level) guard.
 *
 * When ADMIN_REQUIRE_AAL2=true, any request carrying a staff JWT that was
 * minted without a verified MFA challenge (aal1) is rejected with a
 * distinct 403 error code so callers know exactly why they were refused.
 *
 * Non-staff roles (customer, vendor) are completely unaffected.
 *
 * Registered as a global APP_GUARD after SupabaseAuthGuard and RolesGuard so
 * req.user is always populated before this guard runs.
 *
 * Defence-in-depth: the admin Next.js middleware + requireStaff() server gate
 * also enforce aal2, so this guard is a belt-and-suspenders layer that catches
 * staff JWTs hitting the NestJS API directly (e.g. via curl, Postman, or
 * a compromised client).
 */
@Injectable()
export class AalGuard implements CanActivate {
  private readonly logger = new Logger(AalGuard.name);
  private readonly requireAal2: boolean;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.requireAal2 = config.get<string>('ADMIN_REQUIRE_AAL2') === 'true';
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.requireAal2) return true;

    // Only apply to endpoints that require a staff role.
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const hasStaffRole = required?.some((r) => STAFF_ROLES.has(r)) ?? false;
    if (!hasStaffRole) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser | null }>();
    const user = request.user;

    // SupabaseAuthGuard runs first and always populates user; if it's null the
    // upstream guard already threw -- this check is defensive only.
    if (!user || !STAFF_ROLES.has(user.role)) return true;

    if (user.aal !== 'aal2') {
      this.logger.warn(
        `[AalGuard] staff user ${user.id} (role=${user.role}) blocked: aal=${user.aal ?? 'none'}, aal2 required`,
      );
      throw new ForbiddenException({
        code: 'AAL2_REQUIRED',
        message:
          'Two-factor authentication is required for staff access. ' +
          'Enrol at /settings/2fa in the admin console and sign in again.',
      });
    }

    return true;
  }
}
