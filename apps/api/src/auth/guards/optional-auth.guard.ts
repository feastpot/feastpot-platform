import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { SupabaseService } from '../supabase.service';
import type { AuthUser } from '../types';

import { extractBearerToken, mapUser } from './supabase-auth.guard';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser | null;
      headers: Record<string, string | string[] | undefined>;
    }>();

    const authorization = request.headers.authorization;
    const token = extractBearerToken(authorization);
    if (!token) {
      if (authorization) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'Invalid bearer token',
        });
      }
      request.user = null;
      return true;
    }

    try {
      const user = await this.supabase.verifyToken(token);
      request.user = mapUser(user, token);
    } catch {
      // Authentication is optional only when it is absent. Treating an
      // explicitly supplied, invalid credential as anonymous would let a
      // caller silently discard its own identity (and makes bad sessions
      // unnecessarily difficult to diagnose).
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid bearer token',
      });
    }
    return true;
  }
}
