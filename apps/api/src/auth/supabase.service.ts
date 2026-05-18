import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CacheEntry {
  user: User;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly client: SupabaseClient;
  private readonly tokenCache = new Map<string, CacheEntry>();

  constructor(private readonly config: ConfigService) {
    const rawUrl = this.config.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!rawUrl || !serviceRoleKey) {
      this.logger.warn(
        'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured - auth verification will fail at runtime',
      );
    }

    // Normalize: accept either the bare project URL or a full REST URL with
    // /rest/v1/ appended - the JS client expects only the project root.
    const url = rawUrl
      ? rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
      : 'http://placeholder.local';

    this.client = createClient(url, serviceRoleKey ?? 'placeholder', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  async verifyToken(token: string): Promise<User> {
    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Missing access token' });
    }

    const cached = this.tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    const { data, error } = await this.client.auth.getUser(token);

    if (error || !data?.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: error?.message ?? 'Invalid access token',
      });
    }

    this.tokenCache.set(token, { user: data.user, expiresAt: Date.now() + CACHE_TTL_MS });
    this.evictExpired();
    return data.user;
  }

  invalidateToken(token: string): void {
    this.tokenCache.delete(token);
  }

  private evictExpired(): void {
    if (this.tokenCache.size < 1000) return;
    const now = Date.now();
    for (const [token, entry] of this.tokenCache) {
      if (entry.expiresAt <= now) this.tokenCache.delete(token);
    }
  }
}
