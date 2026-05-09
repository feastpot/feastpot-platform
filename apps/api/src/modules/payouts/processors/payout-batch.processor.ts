import { Process, Processor } from '@nestjs/bull';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';

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
  ) {}

  onApplicationBootstrap(): void {
    // Fire-and-forget: queue.add() blocks until Redis accepts the command, which
    // can hang indefinitely in environments without Redis (local dev, CI). We
    // log success/failure but never block app bootstrap on it.
    this.queue
      .add(WEEKLY_BATCH_JOB, {}, { repeat: { cron: '0 2 * * 1' }, jobId: 'weekly-payout' })
      .then(() => this.logger.log('Registered weekly payout cron (Mon 02:00 UTC)'))
      .catch((e: Error) => this.logger.warn(`Failed to register payout cron: ${e.message}`));
  }

  @Process(WEEKLY_BATCH_JOB)
  async processWeekly(): Promise<{ created: number; skipped: number }> {
    const result = await this.payouts.runWeeklyBatch();
    this.logger.log(
      `Weekly batch: ${result.created.length} created, ${result.skippedVendorIds.length} skipped (period ${result.periodStart.toISOString()})`,
    );
    return { created: result.created.length, skipped: result.skippedVendorIds.length };
  }
}
