import { OnQueueFailed, Process, Processor, InjectQueue } from '@nestjs/bull';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Job, Queue } from 'bull';

import { RedisCacheService } from '../../../common/cache/redis-cache.service';
import { shouldReportQueueFailure } from '../../../queues/queue-failure';
import { PayoutsService } from '../payouts.service';

export const PAYOUTS_QUEUE = 'payouts';
export const WEEKLY_BATCH_JOB = 'payout-batch';

/**
 * Job name for individual payout Stripe transfers.
 * Enqueued by PayoutsService.approvePayout() when finance approves a draft.
 * Processed here with up to 5 attempts / exponential backoff so transient
 * Stripe or network failures retry automatically without admin intervention.
 */
export const PAYOUT_TRANSFER_JOB = 'payout-transfer';

export interface PayoutTransferJobData {
  payoutId: string;
}

/**
 * Schedules and processes the weekly vendor payout batch and individual
 * Stripe transfer jobs.
 *
 * Weekly batch:
 *   - Cron: Monday 02:00 UTC (`0 2 * * 1`)
 *   - JobId: `weekly-payout` (de-duplicates if multiple instances bootstrap)
 *   - Concurrency: 1 - race-condition safe for batch idempotency.
 *
 * Individual transfer (`payout-transfer`):
 *   - Enqueued by approvePayout() with attempts:5 / 30-s exponential backoff.
 *   - Concurrency: 3 - individual transfers are isolated by Stripe idempotency
 *     key so parallel execution is safe.
 *   - Terminal Stripe errors (account_closed, debit_not_authorized, etc.) are
 *     classified inside executeTransfer() and do NOT throw, so Bull marks the
 *     job complete and doesn't retry them. Only transient errors (network,
 *     rate-limit, Stripe 5xx) propagate to Bull for retry.
 *   - If all 5 transient retries exhaust, @OnQueueFailed fires and delegates
 *     to PayoutsService.handleExhaustedPayoutTransfer() which marks the payout
 *     failed and fires Slack + vendor notifications.
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
    // register payout cron` warning - noisy and misleading because in
    // practice the cron will never fire anyway without Bull's Redis.
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable - skipping payout cron registration');
      return;
    }
    // Fire-and-forget: queue.add() blocks until Redis accepts the command, which
    // can hang indefinitely in environments without Redis (local dev, CI). We
    // log success/failure but never block app bootstrap on it.
    void this.registerPayoutCron();
  }

  private async registerPayoutCron(): Promise<void> {
    try {
      // Remove stale repeatable-job entries before re-registering. Every API
      // restart that calls queue.add({ repeat }) without this guard appends
      // another copy; when N copies fire at Mon 02:00 UTC, Bull fails with
      // "not in active state: finished" for all but the first.
      const existing = await this.queue.getRepeatableJobs();
      for (const job of existing.filter((j) => j.name === WEEKLY_BATCH_JOB)) {
        await this.queue.removeRepeatableByKey(job.key);
      }
      await this.queue.add(WEEKLY_BATCH_JOB, {}, { repeat: { cron: '0 2 * * 1' }, removeOnComplete: true });
      this.logger.log('Registered weekly payout cron (Mon 02:00 UTC)');
    } catch (e) {
      this.logger.warn(`Failed to register payout cron: ${(e as Error).message}`);
    }
  }

  /**
   * Concurrency MUST stay at 1 - payout jobs move money via Stripe transfers
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

  /**
   * Processes an individual Stripe transfer for a single approved payout.
   * Concurrency 3: transfers are isolated by Stripe idempotency key so
   * parallel runs of the same job are safe (the second returns the existing
   * transfer). The service layer also guards via status checks.
   */
  @Process({ name: PAYOUT_TRANSFER_JOB, concurrency: 3 })
  async processTransfer(job: Job<PayoutTransferJobData>): Promise<void> {
    this.logger.log(
      `Processing payout transfer job ${String(job.id)} for payout ${job.data.payoutId}`,
    );
    await this.payouts.executeTransfer(job.data.payoutId);
  }

  @OnQueueFailed()
  onFailed(job: Job | undefined, err: Error): void {
    // Only alert on final attempt - see notification.processor for rationale.
    if (shouldReportQueueFailure(job, err)) {
      Sentry.captureException(err, {
        tags: { queue: PAYOUTS_QUEUE, jobName: job?.name ?? 'unknown' },
        extra: { jobId: job?.id, attemptsMade: job?.attemptsMade },
      });

      // A payout-transfer job has exhausted all transient-retry attempts.
      // The terminal handler inside executeTransfer() was not reached because
      // all failures were transient (network / rate-limit / Stripe 5xx).
      // Delegate to PayoutsService to mark the payout failed and alert.
      if (job?.name === PAYOUT_TRANSFER_JOB && job.data) {
        const data = job.data as PayoutTransferJobData;
        void this.payouts.handleExhaustedPayoutTransfer(data.payoutId, err).catch((e: Error) => {
          this.logger.error(
            `handleExhaustedPayoutTransfer failed for payout ${data.payoutId}: ${e.message}`,
          );
        });
      }
    }
    this.logger.error(
      `[${PAYOUTS_QUEUE}] job ${job?.id ?? '?'} (${job?.name ?? 'unknown'}) failed (attempt ${job?.attemptsMade ?? '?'}): ${err.message}`,
    );
  }
}
