import { InjectQueue } from '@nestjs/bull';
import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Queue } from 'bull';

import { Public } from '../auth/decorators/public.decorator';
import { RedisCacheService } from '../common/cache/redis-cache.service';
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

interface HealthzResponse {
  status: 'ok' | 'degraded';
  version: string | undefined;
  timestamp: string;
  uptime: number;
  environment: string | undefined;
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error' | 'disabled';
    queues: Record<string, QueueDepth | 'error'>;
  };
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
    const [dbResult, redisResult, queueResult] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1 as ok`,
      this.cache.isEnabled() ? this.cache.ping() : Promise.resolve('disabled' as const),
      this.collectQueueDepths(),
    ]);

    const db: 'ok' | 'error' = dbResult.status === 'fulfilled' ? 'ok' : 'error';
    const redis: 'ok' | 'error' | 'disabled' =
      redisResult.status === 'fulfilled'
        ? redisResult.value === 'disabled'
          ? 'disabled'
          : 'ok'
        : 'error';
    const queues: Record<string, QueueDepth | 'error'> =
      queueResult.status === 'fulfilled' ? queueResult.value : {};

    // Redis being intentionally disabled (no REDIS_URL in dev) is not a
    // degradation — only an unreachable Redis (configured but down) is.
    const allOk = db === 'ok' && redis !== 'error';
    res.status(allOk ? 200 : 503);

    return {
      status: allOk ? 'ok' : 'degraded',
      version: process.env.npm_package_version,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV,
      checks: { database: db, redis, queues },
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
