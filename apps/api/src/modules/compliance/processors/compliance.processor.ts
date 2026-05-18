import { InjectQueue, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Job, Queue } from 'bull';

import { RedisCacheService } from '../../../common/cache/redis-cache.service';
import { COMPLIANCE_QUEUE } from '../../../queues/queues.module';
import { ComplianceService } from '../compliance.service';

export const COMPLIANCE_SCAN_JOB = 'compliance-scan';
export const REVIEW_TRIGGER_JOB = 'review-trigger';
export const BADGE_RECALC_JOB = 'badge-recalc';

/**
 * Three repeatable BullMQ jobs:
 *   - compliance-scan : daily 06:00 UTC (`0 6 * * *`)
 *   - review-trigger  : every 15 minutes (`*\/15 * * * *`)
 *   - badge-recalc    : nightly 01:00 UTC (`0 1 * * *`)
 *
 * Same pattern as PayoutBatchProcessor: register with stable jobIds so multiple
 * pods don't duplicate, and fire-and-forget the registration so a Redis-less
 * dev environment doesn't hang the bootstrap.
 */
@Processor(COMPLIANCE_QUEUE)
export class ComplianceProcessor implements OnApplicationBootstrap {
  private readonly logger = new Logger(ComplianceProcessor.name);

  constructor(
    private readonly compliance: ComplianceService,
    @InjectQueue(COMPLIANCE_QUEUE) private readonly queue: Queue,
    private readonly cache: RedisCacheService,
  ) {}

  onApplicationBootstrap(): void {
    // See PayoutBatchProcessor for the rationale: skip registration when
    // Redis is unavailable to avoid noisy WRONGPASS / connection-refused
    // chatter for crons that can never fire anyway without Bull's Redis.
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable - skipping compliance/review/badge cron registration');
      return;
    }
    void this.registerCron(COMPLIANCE_SCAN_JOB, '0 6 * * *');
    void this.registerCron(REVIEW_TRIGGER_JOB, '*/15 * * * *');
    void this.registerCron(BADGE_RECALC_JOB, '0 1 * * *');
  }

  private async registerCron(name: string, cron: string): Promise<void> {
    try {
      await this.queue.add(name, {}, { repeat: { cron }, jobId: `cron-${name}` });
      this.logger.log(`Registered cron ${name} (${cron})`);
    } catch (e) {
      this.logger.warn(`Failed to register ${name} cron: ${(e as Error).message}`);
    }
  }

  // Concurrency=2 across all compliance handlers: scans hit Postgres heavily
  // (vendor doc + order joins) and there's no benefit to high parallelism.
  @Process({ name: COMPLIANCE_SCAN_JOB, concurrency: 2 })
  async runComplianceScan() {
    const r = await this.compliance.runComplianceScan();
    this.logger.log(`compliance-scan: expiring=${r.expiringNotified} expired=${r.expiredNotified}`);
    return r;
  }

  @Process({ name: REVIEW_TRIGGER_JOB, concurrency: 2 })
  async runReviewTrigger() {
    const r = await this.compliance.runReviewTrigger();
    this.logger.log(`review-trigger: requested=${r.requested}`);
    return r;
  }

  @Process({ name: BADGE_RECALC_JOB, concurrency: 2 })
  async runBadgeRecalc() {
    const r = await this.compliance.runBadgeRecalc();
    this.logger.log(`badge-recalc: updated=${r.updated}`);
    return r;
  }

  @OnQueueFailed()
  onFailed(job: Job | undefined, err: Error): void {
    const exhausted = !job || job.attemptsMade >= ((job.opts?.attempts ?? 1) as number);
    if (exhausted) {
      Sentry.captureException(err, {
        tags: { queue: COMPLIANCE_QUEUE, jobName: job?.name ?? 'unknown' },
        extra: { jobId: job?.id, attemptsMade: job?.attemptsMade },
      });
    }
    this.logger.error(
      `[${COMPLIANCE_QUEUE}] job ${job?.id ?? '?'} (${job?.name ?? '?'}) failed (attempt ${job?.attemptsMade ?? '?'}): ${err.message}`,
    );
  }
}
