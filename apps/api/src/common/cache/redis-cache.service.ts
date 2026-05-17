import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Boot PING budget. If we cannot complete an AUTH+PING handshake within
 * this window, the boot probe gives up and either fail-fasts (prod, auth
 * error) or starts degraded (network blip). 5s comfortably covers Upstash
 * EU→EU TLS handshake (~150ms) plus 3 retry attempts with backoff.
 */
const BOOT_PING_TIMEOUT_MS = 5_000;

/**
 * Reconnect probe interval after ioredis exhausts its retry budget. Once
 * `retryStrategy` returns null, ioredis stops trying forever — so we run
 * a manual probe every 60s. When Upstash comes back (after a credential
 * rotation, network restoration, etc.) the cache restores itself with
 * exactly one log line, no operator intervention required.
 */
const RECONNECT_PROBE_INTERVAL_MS = 60_000;

/** Suppress repeat error logs from the same source for this window. */
const ERROR_LOG_THROTTLE_MS = 60_000;

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
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: Redis | null;
  private readonly enabled: boolean;
  // Flips true once ioredis emits `end` (retryStrategy returned null) — at
  // that point the cache will never reconnect within this process. Used by
  // `available` so cron handlers / processors can short-circuit cleanly
  // when Redis is permanently unreachable (e.g. WRONGPASS).
  private connectionDead = false;
  // Last captured auth-failure error message. Surfaced by `onModuleInit`
  // to decide whether to fail-fast (production WRONGPASS → process.exit)
  // vs degrade quietly (transient network blip).
  private lastAuthError: string | null = null;
  // 60s log throttle so a permanent WRONGPASS doesn't fill the log
  // stream / cost Loki ingestion / starve the event loop with sync
  // log writes (this is what took /livez down on 2026-05-17).
  private lastErrorLog = 0;
  // Periodic reconnect probe (started after ioredis gives up). Cleared
  // when Redis recovers, or on module destroy.
  private reconnectProbe: NodeJS.Timeout | null = null;

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
      // D3: cap reconnection at 3 attempts so a misconfigured REDIS_URL
      // (wrong password, dead host) doesn't spam ERROR logs at 1 Hz
      // forever. After the 3rd failed attempt we log ONCE that we're
      // giving up and return null — ioredis emits `end`, the cache stays
      // in degraded mode, and every operation falls through to the
      // source of truth.
      retryStrategy: (times: number) => {
        if (times === 1) {
          this.logger.warn('[Redis] Attempting to reconnect...');
        }
        if (times > 3) {
          if (times === 4) {
            this.logger.warn(
              '[Redis] Could not connect after 3 attempts — cache disabled. Check REDIS_URL secret.',
            );
          }
          return null;
        }
        return Math.min(times * 500, 2000);
      },
      reconnectOnError: () => false,
    });
    this.client.on('error', (err) => {
      // Capture auth failures so `onModuleInit` can decide whether to
      // fail-fast at boot (prod WRONGPASS → process.exit(1)). The actual
      // log line is throttled to once per 60s — see notes on
      // `lastErrorLog`. The 2026-05-17 incident was caused by an
      // un-throttled 1Hz log loop from the throttler client; we make
      // sure the cache can never be the cause of the same failure mode.
      const msg = err?.message ?? '';
      if (/WRONGPASS|NOAUTH/i.test(msg)) {
        this.lastAuthError = msg;
      }
      const now = Date.now();
      if (now - this.lastErrorLog > ERROR_LOG_THROTTLE_MS) {
        this.lastErrorLog = now;
        this.logger.warn(
          `[Redis] Cache client error: ${msg} (further errors suppressed for 60s)`,
        );
      }
    });
    this.client.on('end', () => {
      // ioredis emits 'end' once retryStrategy returns null. From here on,
      // every operation is a no-op (try/catch swallows the closed-conn
      // error) — equivalent to running without REDIS_URL. We additionally
      // start a periodic reconnect probe so the cache auto-recovers when
      // Redis comes back (e.g. after a credential rotation), without
      // requiring an operator to redeploy.
      this.connectionDead = true;
      this.logger.warn(
        '[Redis] Cache disabled after exhausting reconnection attempts — probing every 60s',
      );
      this.startReconnectProbe();
    });
    this.client.on('ready', () => {
      // If a transient blip recovered, treat the cache as live again.
      const wasDead = this.connectionDead;
      this.connectionDead = false;
      this.lastAuthError = null;
      if (wasDead) {
        this.logger.log('[Redis] Cache reconnected — caching restored');
      }
      this.stopReconnectProbe();
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
   * Public availability flag for cron + processor services. Mirrors
   * `isEnabled()` but exposed as a property getter so callers can write
   * the more natural `if (!cache.available) return;` guard at the top of
   * a cron handler — the same shape used by ops runbooks.
   *
   * `enabled` reflects whether `REDIS_URL` was set at boot. We additionally
   * gate on `connectionDead` (set by the `end` event) so that once ioredis
   * has exhausted reconnection attempts — e.g. WRONGPASS, dead host —
   * cron handlers / processors short-circuit cleanly instead of piling
   * up failed `queue.add()` calls. A transient blip during which ioredis
   * is still retrying does NOT flip this — only permanent giveup does.
   */
  get available(): boolean {
    return this.enabled && !this.connectionDead;
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

  /**
   * Fail-fast boot probe. Waits up to 5s for the cache client to reach
   * `ready` (handshake + AUTH complete). Three outcomes:
   *
   *   1. `ready` fires → log success, return. Normal path.
   *   2. `end` fires (ioredis exhausted retries) → check whether we
   *      captured a WRONGPASS/NOAUTH error along the way. If yes and
   *      NODE_ENV=production, `process.exit(1)` so the container
   *      crash-loops with a clear `[CRITICAL]` log line — operators get
   *      a "deployment unhealthy" alert instead of a silent degradation
   *      that takes the whole site down (2026-05-17 failure mode).
   *   3. 5s timeout → degrade quietly. Probably a network blip; the
   *      reconnect probe will keep trying.
   *
   * In dev (`NODE_ENV !== 'production'`) we never exit, so a stale
   * `.env.local` doesn't stop the API from booting.
   */
  async onModuleInit(): Promise<void> {
    if (!this.client) return;

    const client = this.client;
    const outcome = await new Promise<'ready' | 'end' | 'timeout'>((resolve) => {
      if (client.status === 'ready') {
        resolve('ready');
        return;
      }
      const onReady = () => {
        cleanup();
        resolve('ready');
      };
      const onEnd = () => {
        cleanup();
        resolve('end');
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve('timeout');
      }, BOOT_PING_TIMEOUT_MS);
      timer.unref?.();
      const cleanup = () => {
        clearTimeout(timer);
        client.off('ready', onReady);
        client.off('end', onEnd);
      };
      client.once('ready', onReady);
      client.once('end', onEnd);
    });

    if (outcome === 'ready') {
      this.logger.log('[Redis] Boot connection succeeded — cache healthy');
      return;
    }

    // If we timed out before either ready/end fired, the auth error may
    // still be arriving on a different microtask. Yield once and re-check
    // both `lastAuthError` and the client's reported status so a slow
    // WRONGPASS still trips the fail-fast path (architect review fix).
    if (outcome === 'timeout') {
      await new Promise<void>((r) => setImmediate(r));
      const status = client.status;
      if (
        !this.lastAuthError &&
        (status === 'end' || status === 'close' || status === 'reconnecting')
      ) {
        // Status indicates a connection problem but we didn't capture a
        // specific auth error — surface it in the log line below.
        this.logger.debug(`[Redis] Boot timeout — ioredis status=${status}`);
      }
    }

    // ioredis gave up OR we timed out. If we captured an auth error
    // along the way, this is unrecoverable without a secret rotation
    // — fail-fast in production so the deployment is visibly broken.
    if (this.lastAuthError && process.env.NODE_ENV === 'production') {
      this.logger.error(
        `[CRITICAL] REDIS_URL auth failed at boot (${this.lastAuthError}) — ` +
          'rotate REDIS_URL in Replit Secrets (workspace AND deployment) and redeploy. ' +
          'Aborting to prevent silent degradation and event-loop starvation.',
      );
      // Set exitCode so the process terminates non-zero even if the
      // delayed exit() never runs (architect review fix — do NOT unref
      // this timer or the event loop could drain before exit fires).
      process.exitCode = 1;
      setTimeout(() => process.exit(1), 100);
      return;
    }

    this.logger.warn(
      `[Redis] Boot ${outcome === 'timeout' ? 'PING timed out after 5s' : 'connection failed'}` +
        `${this.lastAuthError ? ` (${this.lastAuthError})` : ''} — ` +
        'running degraded. Cache and queues disabled until Redis recovers.',
    );
  }

  /**
   * Start a 60s manual reconnect probe. Triggered when ioredis emits
   * `end` (retryStrategy returned null). Calls `client.connect()` on
   * each tick — if it succeeds, the `ready` handler stops the probe and
   * logs the recovery. No-ops if a probe is already running.
   */
  private startReconnectProbe(): void {
    if (this.reconnectProbe || !this.client) return;
    const client = this.client;
    this.reconnectProbe = setInterval(() => {
      // `connect()` rejects if the client is already connecting / connected;
      // we just swallow — the `ready` handler is what flips state back.
      client.connect().catch(() => {
        /* still down — next probe in 60s */
      });
    }, RECONNECT_PROBE_INTERVAL_MS);
    this.reconnectProbe.unref?.();
  }

  private stopReconnectProbe(): void {
    if (this.reconnectProbe) {
      clearInterval(this.reconnectProbe);
      this.reconnectProbe = null;
    }
  }

  onModuleDestroy(): void {
    this.stopReconnectProbe();
    this.client?.disconnect();
  }
}
