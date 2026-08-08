import { InjectQueue, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Job, Queue } from 'bull';

import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { shouldReportQueueFailure } from '../../queues/queue-failure';
import { HMRC_QUEUE } from '../../queues/queues.module';

import { HmrcReportService } from './hmrc-report.service';

export const HMRC_ANNUAL_REPORT_JOB = 'hmrc-annual-report';
export const HMRC_SEND_COPIES_JOB = 'hmrc-send-copies';
export const HMRC_DEADLINE_ALERT_JOB = 'hmrc-deadline-alert';

/**
 * Cron schedule:
 *   - hmrc-annual-report : 3 Jan at 09:00 UTC (`0 9 3 1 *`)
 *     Generates the PlatformReport rows for the prior year.
 *   - hmrc-send-copies   : 5 Jan at 09:00 UTC (`0 9 5 1 *`)
 *     Sends each vendor their annual copy (runs after report generation).
 *   - hmrc-deadline-alert : 15 Jan at 09:00 UTC (`0 9 15 1 *`)
 *     Alerts the founder that the 31 Jan HMRC deadline is 16 days away.
 *
 * Same pattern as ComplianceProcessor: stable jobIds prevent duplicate
 * registrations across pods, and registration is fire-and-forget so
 * a Redis-less dev environment doesn't block bootstrap.
 */
@Processor(HMRC_QUEUE)
export class HmrcReportProcessor implements OnApplicationBootstrap {
  private readonly logger = new Logger(HmrcReportProcessor.name);

  constructor(
    private readonly hmrc: HmrcReportService,
    @InjectQueue(HMRC_QUEUE) private readonly queue: Queue,
    private readonly cache: RedisCacheService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable - skipping HMRC cron registration');
      return;
    }
    void this.registerCron(HMRC_ANNUAL_REPORT_JOB, '0 9 3 1 *');
    void this.registerCron(HMRC_SEND_COPIES_JOB, '0 9 5 1 *');
    void this.registerCron(HMRC_DEADLINE_ALERT_JOB, '0 9 15 1 *');
  }

  private async registerCron(name: string, cron: string): Promise<void> {
    try {
      await this.queue.add(name, {}, { repeat: { cron }, jobId: `cron-${name}` });
      this.logger.log(`Registered HMRC cron ${name} (${cron})`);
    } catch (e) {
      this.logger.warn(`Failed to register HMRC cron ${name}: ${(e as Error).message}`);
    }
  }

  @Process({ name: HMRC_ANNUAL_REPORT_JOB, concurrency: 1 })
  async runAnnualReport(job: Job<{ year?: number }>) {
    // Default to prior calendar year (cron fires in January)
    const year = job.data.year ?? new Date().getUTCFullYear() - 1;
    this.logger.log(`Running HMRC annual report generation for year ${year}`);
    const result = await this.hmrc.generateAnnualReport(year);
    this.logger.log(
      `HMRC annual report ${year}: ${result.vendorsWithActivity} vendors, ${result.rowsUpserted} rows`,
    );
    return result;
  }

  @Process({ name: HMRC_SEND_COPIES_JOB, concurrency: 1 })
  async runSendCopies(job: Job<{ year?: number }>) {
    const year = job.data.year ?? new Date().getUTCFullYear() - 1;
    this.logger.log(`Sending HMRC vendor copies for year ${year}`);
    const result = await this.hmrc.sendVendorCopies(year);
    this.logger.log(`HMRC copies: sent=${result.sent} skipped=${result.skipped}`);
    return result;
  }

  @Process({ name: HMRC_DEADLINE_ALERT_JOB, concurrency: 1 })
  async runDeadlineAlert(job: Job<{ year?: number }>) {
    const year = job.data.year ?? new Date().getUTCFullYear();
    this.logger.log(`Sending HMRC deadline alert (deadline: 31 Jan ${year})`);
    await this.hmrc.sendDeadlineAlert(year);
    return { alertSent: true };
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error): void {
    if (shouldReportQueueFailure(job, err)) {
      Sentry.captureException(err, {
        tags: { queue: HMRC_QUEUE, job: job.name },
        extra: { jobId: job.id, data: job.data, attemptsMade: job.attemptsMade },
      });
    }
    this.logger.error(
      `HMRC job ${job.name} failed (attempt ${job.attemptsMade}/${(job.opts.attempts as number | undefined) ?? 5}): ${err.message}`,
    );
  }
}
