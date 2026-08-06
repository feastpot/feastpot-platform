import { InjectQueue } from '@nestjs/bull';
import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Queue } from 'bull';
import type { Response } from 'express';

import { Public } from '../auth/decorators/public.decorator';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  COMPLIANCE_QUEUE,
  NOTIFICATIONS_QUEUE,
  PAYOUTS_QUEUE,
  STRIPE_WEBHOOK_QUEUE,
} from '../queues/queues.module';

import { HealthController } from './health.controller';

/**
 * Top-level `/healthz` endpoint mirrored at both `/healthz` (unversioned -
 * for legacy LB / autoscale probes) and `/v1/healthz` (versioned - for the
 * public API contract). Delegates to HealthController's existing readiness
 * implementation so we have a single source of truth for the deep check.
 *
 * Versioning trick: passing `[VERSION_NEUTRAL, '1']` mounts the same handler
 * at both paths so we don't have to maintain two controllers.
 */
// Skip rate-limiting for the same reason as RootController/HealthController:
// `/healthz` + `/v1/healthz` are continuously probed; throttling them only
// burns Redis quota and risks 429'ing a liveness check.
@SkipThrottle()
@ApiTags('health')
@Controller({ path: 'healthz', version: [VERSION_NEUTRAL, '1'] })
export class HealthzController {
  private readonly delegate: HealthController;

  constructor(
    prisma: PrismaService,
    cache: RedisCacheService,
    @InjectQueue(NOTIFICATIONS_QUEUE) notifications: Queue,
    @InjectQueue(STRIPE_WEBHOOK_QUEUE) stripeWebhooks: Queue,
    @InjectQueue(PAYOUTS_QUEUE) payouts: Queue,
    @InjectQueue(COMPLIANCE_QUEUE) compliance: Queue,
  ) {
    this.delegate = new HealthController(
      prisma,
      cache,
      notifications,
      stripeWebhooks,
      payouts,
      compliance,
    );
  }

  @Public()
  @Get()
  healthz(@Res({ passthrough: true }) res: Response) {
    return this.delegate.healthz(res);
  }
}

type ComponentState = 'operational' | 'degraded' | 'down';

/**
 * Minimal PUBLIC status contract for the customer-facing status page.
 *
 * Deliberately narrow (review finding): unlike `/healthz` it exposes NO
 * queue counts, dependency configuration, secret status, Supabase project
 * identity or version info - only coarse per-component states. Anything a
 * status page shows is world-readable, so keep this to what a customer
 * legitimately needs to know.
 */
@SkipThrottle()
@ApiTags('health')
@Controller({ path: 'statusz', version: [VERSION_NEUTRAL, '1'] })
export class StatuszController {
  private readonly delegate: HealthController;

  constructor(
    prisma: PrismaService,
    cache: RedisCacheService,
    @InjectQueue(NOTIFICATIONS_QUEUE) notifications: Queue,
    @InjectQueue(STRIPE_WEBHOOK_QUEUE) stripeWebhooks: Queue,
    @InjectQueue(PAYOUTS_QUEUE) payouts: Queue,
    @InjectQueue(COMPLIANCE_QUEUE) compliance: Queue,
  ) {
    this.delegate = new HealthController(
      prisma,
      cache,
      notifications,
      stripeWebhooks,
      payouts,
      compliance,
    );
  }

  @Public()
  @Get()
  async statusz(@Res({ passthrough: true }) res: Response): Promise<{
    status: 'ok' | 'degraded' | 'down';
    timestamp: string;
    components: Record<string, ComponentState>;
  }> {
    const full = await this.delegate.healthz(res);
    const checks = full.checks;

    const queues = checks.queues as Record<string, { failed?: number } | string>;
    let failedJobs = 0;
    let queuesBroken = false;
    for (const value of Object.values(queues ?? {})) {
      if (typeof value === 'string') queuesBroken = true;
      else failedJobs += value.failed ?? 0;
    }

    const componentState = (ok: boolean, degraded = false): ComponentState =>
      ok ? (degraded ? 'degraded' : 'operational') : 'down';

    return {
      status: full.status,
      timestamp: full.timestamp,
      components: {
        api: componentState(full.status !== 'down', full.status === 'degraded'),
        database: componentState(checks.database === 'ok'),
        backgroundProcessing: componentState(
          checks.redis === 'ok' && !queuesBroken,
          failedJobs > 0,
        ),
        payments: componentState(checks.stripe === 'live' || checks.stripe === 'test'),
      },
    };
  }
}
