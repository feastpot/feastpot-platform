import { InjectQueue } from '@nestjs/bull';
import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Queue } from 'bull';

import { Public } from '../auth/decorators/public.decorator';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { missingRequiredEnv } from '../common/config/required-env';
import { PrismaService } from '../prisma/prisma.service';
import {
  COMPLIANCE_QUEUE,
  NOTIFICATIONS_QUEUE,
  PAYOUTS_QUEUE,
  STRIPE_WEBHOOK_QUEUE,
} from '../queues/queues.module';

interface QueueDepth {
  waiting: number;
  active: number;
  failed: number;
}

type DbStatus = 'ok' | 'error' | 'timeout';
type RedisStatus = 'ok' | 'error' | 'disabled' | 'timeout';
type QueueStatus = Record<string, QueueDepth | 'error'> | { error: string };

interface HealthzResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string | undefined;
  timestamp: string;
  uptime: number;
  environment: string | undefined;
  checks: {
    database: DbStatus;
    redis: RedisStatus;
    queues: QueueStatus;
    secrets: 'ok' | string;
  };
}

// D3 part 2: every dependency check is wrapped in a 2s timeout so a hung
// ioredis/Bull client can never block the readiness probe past ~2s. A
// healthy /healthz must respond in <1s; the spec allows up to ~3s as the
// degraded-with-timeout ceiling.
const CHECK_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, fallback: T, ms = CHECK_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      const t = setTimeout(() => resolve(fallback), ms);
      // Don't keep the event loop alive just for this timer.
      t.unref?.();
    }),
  ]);
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
    @InjectQueue(STRIPE_WEBHOOK_QUEUE) private readonly stripeWebhooks: Queue,
    @InjectQueue(PAYOUTS_QUEUE) private readonly payouts: Queue,
    @InjectQueue(COMPLIANCE_QUEUE) private readonly compliance: Queue,
  ) {}

  /**
   * Liveness probe: zero-IO, used by Replit Autoscale to verify the process
   * is responsive. We deliberately do NOT touch the DB here — a Postgres
   * blip should not cause the orchestrator to kill an otherwise healthy
   * pod.
   */
  @Public()
  @Get()
  check(): { status: string; version: string | undefined; timestamp: string; environment: string | undefined } {
    return {
      status: 'ok',
      version: process.env.npm_package_version,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    };
  }

  /**
   * Readiness probe: deep dependency check. Returns 503 if Postgres or
   * Redis is unreachable so a load balancer can drain the instance.
   * Queue depths are reported for visibility but do NOT contribute to the
   * 200/503 verdict — a backed-up queue is a paging concern, not a
   * "remove from rotation" concern (the API still serves reads fine).
   */
  @Public()
  @Get('z')
  async healthz(@Res({ passthrough: true }) res: Response): Promise<HealthzResponse> {
    // D3 part 2: each check has its own 2s timeout via withTimeout so a
    // dead Redis (Bull's blocking ioredis commands) can never hang this
    // endpoint past ~2s. Previously a P1-blocking 30s wait was possible.
    const [db, redis, queues] = await Promise.all([
      withTimeout<DbStatus>(
        this.prisma
          .$queryRaw`SELECT 1 as ok`
          .then<DbStatus>(() => 'ok')
          .catch<DbStatus>(() => 'error'),
        'timeout',
      ),
      withTimeout<RedisStatus>(
        this.cache.isEnabled()
          ? this.cache
              .ping()
              .then<RedisStatus>((r) => (r === 'PONG' ? 'ok' : 'error'))
              .catch<RedisStatus>(() => 'error')
          : Promise.resolve<RedisStatus>('disabled'),
        'timeout',
      ),
      withTimeout<QueueStatus>(
        this.collectQueueDepths(),
        { error: 'timeout — Redis may be unhealthy' },
      ),
    ]);

    // D21: a missing required secret (e.g. STRIPE_WEBHOOK_SECRET) is a
    // hard 503 — payment confirmations would be silently dropped, so the
    // load balancer should drain the instance. This is intentionally
    // stricter than D3 part 2's "Redis-only outages stay 200" rule
    // because a missing secret blocks revenue-critical work.
    const missing = missingRequiredEnv();
    const secrets: 'ok' | string = missing.length === 0 ? 'ok' : `missing: ${missing.join(', ')}`;

    // Status verdict:
    //   - DB unreachable / timed out → "down" (503), uptime monitors page.
    //   - Required secret missing → "down" (503), config emergency.
    //   - Redis unreachable / queues unreachable → "degraded" (200),
    //     so uptime monitors do NOT page — API still serves reads.
    //   - Otherwise → "ok" (200).
    const dbDown = db !== 'ok';
    const secretsDown = missing.length > 0;
    const redisDegraded = redis === 'error' || redis === 'timeout';
    const queuesDegraded =
      'error' in (queues as Record<string, unknown>) ||
      Object.values(queues).some((v) => v === 'error');

    const status: HealthzResponse['status'] =
      dbDown || secretsDown ? 'down' : redisDegraded || queuesDegraded ? 'degraded' : 'ok';

    res.status(status === 'down' ? 503 : 200);

    return {
      status,
      version: process.env.npm_package_version,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV,
      checks: { database: db, redis, queues, secrets },
    };
  }

  private async collectQueueDepths(): Promise<Record<string, QueueDepth | 'error'>> {
    const queues: Array<[string, Queue]> = [
      [NOTIFICATIONS_QUEUE, this.notifications],
      [STRIPE_WEBHOOK_QUEUE, this.stripeWebhooks],
      [PAYOUTS_QUEUE, this.payouts],
      [COMPLIANCE_QUEUE, this.compliance],
    ];
    const out: Record<string, QueueDepth | 'error'> = {};
    await Promise.all(
      queues.map(async ([name, q]) => {
        try {
          const [waiting, active, failed] = await Promise.all([
            q.getWaitingCount(),
            q.getActiveCount(),
            q.getFailedCount(),
          ]);
          out[name] = { waiting, active, failed };
        } catch {
          out[name] = 'error';
        }
      }),
    );
    return out;
  }
}
