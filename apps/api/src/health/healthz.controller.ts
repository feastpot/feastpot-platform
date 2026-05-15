import { InjectQueue } from '@nestjs/bull';
import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
 * Top-level `/healthz` endpoint mirrored at both `/healthz` (unversioned —
 * for legacy LB / autoscale probes) and `/v1/healthz` (versioned — for the
 * public API contract). Delegates to HealthController's existing readiness
 * implementation so we have a single source of truth for the deep check.
 *
 * Versioning trick: passing `[VERSION_NEUTRAL, '1']` mounts the same handler
 * at both paths so we don't have to maintain two controllers.
 */
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
    this.delegate = new HealthController(prisma, cache, notifications, stripeWebhooks, payouts, compliance);
  }

  @Public()
  @Get()
  healthz(@Res({ passthrough: true }) res: Response) {
    return this.delegate.healthz(res);
  }
}
