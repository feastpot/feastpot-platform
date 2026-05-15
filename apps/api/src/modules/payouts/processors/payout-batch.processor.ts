import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import * as Sentry from '@sentry/nestjs';
import type { Job, Queue } from 'bull';

import { RedisCacheService } from '../../../common/cache/redis-cache.service';
import { PayoutsService } from '../payouts.service';

export const PAYOUTS_QUEUE = 'payouts';
export const WEEKLY_BATCH_JOB = 'payout-batch';

/**
 * Schedules and processes the weekly vendor payout batch.
 *   - Cron: Monday 02:00 UTC (`0 2 * * 1`)
 *   - JobId: `weekly-payout` (de-duplicates if multiple instances bootstrap)
 *
 * Bull stores repeatable jobs centrally in Redis, so even with multiple API
 * pods only one execution per cron tick happens.
 */
@Processor(PAYOUTS_QUEUE)
export class PayoutBatchProcessor implements OnApplicationBootstrap {
  private readonly logger = new Logger(PayoutBatchProcessor.name);

  constructor(
    private readonly payouts: PayoutsService,
    @InjectQueue(PAYOUTS_QUEUE) private readonly queue: Queue,
    private readonly cache: RedisCacheService,
  ) {}

  onApplicationBootstrap(): void {
    // Skip cron registration entirely when Redis is unavailable. Without
    // this guard, queue.add() retries against a dead/misconfigured Redis
    // for the cap window (~5 attempts) before logging a `Failed to
    // register payout cron` warning — noisy and misleading because in
    // practice the cron will never fire anyway without Bull's Redis.
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable — skipping payout cron registration');
      return;
    }
    // Fire-and-forget: queue.add() blocks until Redis accepts the command, which
    // can hang indefinitely in environments without Redis (local dev, CI). We
    // log success/failure but never block app bootstrap on it.
    this.queue
      .add(WEEKLY_BATCH_JOB, {}, { repeat: { cron: '0 2 * * 1' }, jobId: 'weekly-payout' })
      .then(() => this.logger.log('Registered weekly payout cron (Mon 02:00 UTC)'))
      .catch((e: Error) => this.logger.warn(`Failed to register payout cron: ${e.message}`));
  }

  /**
   * Concurrency MUST stay at 1 — payout jobs move money via Stripe transfers
   * and the batch's idempotency relies on exactly one runner advancing
   * each vendor's payout window at a time. Two parallel workers could
   * race the same vendor row and double-transfer.
   */
  @Process({ name: WEEKLY_BATCH_JOB, concurrency: 1 })
  async processWeekly(): Promise<{ created: number; skipped: number }> {
    const result = await this.payouts.runWeeklyBatch();
    this.logger.log(
      `Weekly batch: ${result.created.length} created, ${result.skippedVendorIds.length} skipped (period ${result.periodStart.toISOString()})`,
    );
    return { created: result.created.length, skipped: result.skippedVendorIds.length };
  }

  @OnQueueFailed()
  onFailed(job: Job | undefined, err: Error): void {
    // Only alert on final attempt — see notification.processor for rationale.
    const exhausted = !job || job.attemptsMade >= ((job.opts?.attempts ?? 1) as number);
    if (exhausted) {
      Sentry.captureException(err, {
        tags: { queue: PAYOUTS_QUEUE, jobName: job?.name ?? 'unknown' },
        extra: { jobId: job?.id, attemptsMade: job?.attemptsMade },
      });
    }
    this.logger.error(
      `[${PAYOUTS_QUEUE}] job ${job?.id ?? '?'} failed (attempt ${job?.attemptsMade ?? '?'}): ${err.message}`,
    );
  }
}
