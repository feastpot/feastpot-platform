import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * General-purpose Redis cache for hot read paths (vendor profiles, search
 * results, etc). Distinct from Bull's Redis client — Bull manages its own
 * connection lifecycle via @nestjs/bull and we MUST NOT share its instance
 * (Bull uses blocking commands that would stall any concurrent get/setex).
 *
 * Reliability stance:
 *   - `enableOfflineQueue: false` — fail fast if Redis is down. Better a
 *     cache miss than commands queued and timing out under load.
 *   - Every public method swallows errors. A degraded cache MUST never
 *     break a request — callers are expected to fall through to the DB.
 *
 * If `REDIS_URL` is unset (local dev without Redis), every operation
 * becomes a no-op so `findById` / `search` etc just hit Postgres.
 */
@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: Redis | null;
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (!url) {
      this.client = null;
      this.enabled = false;
      this.logger.warn('REDIS_URL not set — cache operations are no-ops');
      return;
    }

    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
      connectionName: 'feastpot-cache',
      // Cap reconnection attempts so a misconfigured REDIS_URL (wrong
      // password, dead host) doesn't spam ERROR logs at 1 Hz forever.
      // After 5 failures we give up and the cache stays in degraded mode
      // — every operation falls through to the source of truth.
      retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 500, 3000)),
      reconnectOnError: () => false,
    });
    let errorCount = 0;
    this.client.on('error', (err) => {
      // Log only the first handful so a permanent auth error doesn't drown
      // the rest of the log stream. After that it's just noise.
      if (errorCount < 3) {
        this.logger.error(`Redis cache error: ${err.message}`);
      } else if (errorCount === 3) {
        this.logger.error('Redis cache error (further errors will be suppressed)');
      }
      errorCount += 1;
    });
    this.client.on('end', () => {
      // ioredis emits 'end' once retryStrategy returns null. From here on,
      // every operation is a no-op (try/catch swallows the closed-conn
      // error) — equivalent to running without REDIS_URL.
      this.logger.warn('Redis cache disabled after exhausting reconnection attempts');
    });
    this.enabled = true;

    // Lazy connect — actually establish the TCP connection now so the first
    // request doesn't pay the handshake cost. Fire-and-forget; on failure
    // we just log and keep going (the client will retry per retryStrategy).
    this.client.connect().catch((err: Error) => {
      this.logger.warn(`Redis cache initial connect failed: ${err.message}`);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const val = await this.client.get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      /* fire and forget */
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch {
      /* */
    }
  }

  /**
   * Pattern delete via SCAN (NOT KEYS — KEYS is O(N) and blocks Redis).
   * Used to invalidate broad search-result keyspaces when a vendor updates.
   */
  async delByPattern(pattern: string): Promise<void> {
    if (!this.client) return;
    try {
      const stream = this.client.scanStream({ match: pattern, count: 100 });
      const pipeline = this.client.pipeline();
      let queued = 0;
      for await (const keys of stream as AsyncIterable<string[]>) {
        for (const k of keys) {
          pipeline.del(k);
          queued += 1;
        }
      }
      if (queued > 0) await pipeline.exec();
    } catch {
      /* */
    }
  }

  async ping(): Promise<'PONG'> {
    if (!this.client) throw new Error('redis disabled');
    return (await this.client.ping()) as 'PONG';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Build a deterministic cache key fragment from an object. Sorts keys so
   * `{a:1,b:2}` and `{b:2,a:1}` collapse to the same bucket — without this,
   * client field-order variation produces duplicate cache entries for
   * functionally identical queries.
   */
  static stableKey(obj: unknown): string {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      return JSON.stringify(obj);
    }
    const o = obj as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) sorted[k] = o[k];
    return JSON.stringify(sorted);
  }

  onModuleDestroy(): void {
    this.client?.disconnect();
  }
}
