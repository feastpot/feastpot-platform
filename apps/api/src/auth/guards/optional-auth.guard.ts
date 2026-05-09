import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';

import { SupabaseService } from '../supabase.service';
import type { AuthUser } from '../types';

import { extractBearerToken, mapUser } from './supabase-auth.guard';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  private readonly logger = new Logger(OptionalAuthGuard.name);

  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser | null;
      headers: Record<string, string | string[] | undefined>;
    }>();

    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      request.user = null;
      return true;
    }

    try {
      const user = await this.supabase.verifyToken(token);
      request.user = mapUser(user, token);
    } catch (err) {
      this.logger.debug(`Optional auth: token rejected — ${(err as Error).message}`);
      request.user = null;
    }
    return true;
  }
}
