import type { User } from '@supabase/supabase-js';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SupabaseService } from '../supabase.service';
import type { AuthUser } from '../types';

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
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
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
    request.user = mapUser(user, token);
    return true;
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
