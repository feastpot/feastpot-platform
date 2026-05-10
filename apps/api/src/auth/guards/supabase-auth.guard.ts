import type { User } from '@supabase/supabase-js';

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SupabaseService } from '../supabase.service';
import type { AuthUser } from '../types';

interface StatusCacheEntry {
  status: UserStatus;
  expiresAt: number;
}

const STATUS_CACHE_TTL_MS = 60_000;

const VALID_ROLES = new Set<UserRole>([
  UserRole.customer,
  UserRole.vendor,
  UserRole.admin,
  UserRole.support,
  UserRole.finance,
  UserRole.compliance,
]);

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  // Per-userId status cache so we don't hit Postgres on every request. Keeps
  // the request hot path at one Supabase token-cache hit + (mostly) one
  // in-process map lookup. TTL is short enough that a status flip from
  // active -> suspended/deleted is enforced within a minute even when the
  // user's JWT is still valid.
  private readonly statusCache = new Map<string, StatusCacheEntry>();

  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      user?: AuthUser | null;
      headers: Record<string, string | string[] | undefined>;
    }>();

    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Missing bearer token' });
    }

    const user = await this.supabase.verifyToken(token);
    const mapped = mapUser(user, token);

    // Defence-in-depth: even with a valid JWT, refuse if the user has been
    // soft-deleted or suspended in our own DB. Without this check, a
    // 60-minute Supabase access token survives a Supabase deleteUser failure
    // (or an admin's status flip) until it naturally expires.
    const status = await this.getUserStatus(mapped.id);
    if (status === UserStatus.deleted) {
      throw new UnauthorizedException({ code: 'ACCOUNT_DELETED', message: 'Account has been deleted' });
    }
    if (status === UserStatus.suspended) {
      throw new ForbiddenException({ code: 'ACCOUNT_SUSPENDED', message: 'Account is suspended' });
    }

    request.user = mapped;
    return true;
  }

  /**
   * Look up `public.users.status` with a small in-memory cache. If the row
   * doesn't exist (never-seen Supabase user), we treat them as `active` so
   * onboarding flows that create the local row on first call continue to
   * work — they'll be re-checked on the next request anyway.
   */
  private async getUserStatus(userId: string): Promise<UserStatus> {
    const cached = this.statusCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.status;

    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    const status = row?.status ?? UserStatus.active;
    this.statusCache.set(userId, { status, expiresAt: Date.now() + STATUS_CACHE_TTL_MS });
    if (this.statusCache.size > 1000) this.evictExpiredStatus();
    return status;
  }

  private evictExpiredStatus(): void {
    const now = Date.now();
    for (const [id, entry] of this.statusCache) {
      if (entry.expiresAt <= now) this.statusCache.delete(id);
    }
  }
}

export function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const [scheme, token] = value.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const parsed = JSON.parse(payload) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function mapUser(user: User, verifiedToken: string): AuthUser {
  // Trust ONLY the verified JWT's top-level `role` claim (set by the Supabase
  // custom_access_token_hook) and `app_metadata.role` (server-managed).
  // NEVER trust `user_metadata.role` — that field is user-writable and would
  // allow privilege escalation.
  const claims = decodeJwtClaims(verifiedToken);
  const jwtRole = claims && typeof claims.role === 'string' ? claims.role : null;
  const appRole = (user.app_metadata as Record<string, unknown> | undefined)?.role;
  const candidate = jwtRole ?? (typeof appRole === 'string' ? appRole : 'customer');
  const role = VALID_ROLES.has(candidate as UserRole) ? (candidate as UserRole) : UserRole.customer;

  if (!user.email) {
    throw new UnauthorizedException({
      code: 'UNAUTHORIZED',
      message: 'Authenticated user has no email',
    });
  }

  return { id: user.id, email: user.email, role };
}
