import { InjectQueue, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Job, Queue } from 'bull';

import { RedisCacheService } from '../../../common/cache/redis-cache.service';
import { shouldReportQueueFailure } from '../../../queues/queue-failure';
import { COMPLIANCE_QUEUE } from '../../../queues/queues.module';
import { VendorVerificationService } from '../../vendor-verification/vendor-verification.service';
import { ComplianceService } from '../compliance.service';

export const COMPLIANCE_SCAN_JOB = 'compliance-scan';
export const REVIEW_TRIGGER_JOB = 'review-trigger';
export const BADGE_RECALC_JOB = 'badge-recalc';
export const VERIFICATION_SCAN_JOB = 'verification-scan';
export const FSA_REFRESH_JOB = 'fsa-refresh';

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
    // VendorVerificationModule is @Global - injectable without module import.
    private readonly verification: VendorVerificationService,
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
    // Verification: daily at 07:00 UTC (offset from compliance-scan).
    void this.registerCron(VERIFICATION_SCAN_JOB, '0 7 * * *');
    // FSA rating refresh: weekly on Monday at 03:00 UTC.
    void this.registerCron(FSA_REFRESH_JOB, '0 3 * * 1');
  }

  private async registerCron(name: string, cron: string): Promise<void> {
    try {
      const existing = await this.queue.getRepeatableJobs();
      const matching = existing.filter((j) => j.name === name);

      // If the schedule is already registered exactly once with the correct
      // cron expression, skip remove/re-add entirely. Calling
      // removeRepeatableByKey while an instance is actively running causes
      // Bull to throw "repeat key is not in active state", which then
      // prevents the replacement job from being registered.
      if (matching.length === 1 && matching[0].cron === cron) {
        this.logger.debug(`Cron ${name} already registered (${cron}) -- skipping`);
        return;
      }

      // Remove stale or duplicate entries. Swallow per-key errors so a
      // stuck in-flight instance doesn't block the others from being cleaned.
      for (const job of matching) {
        try {
          await this.queue.removeRepeatableByKey(job.key);
        } catch (removeErr) {
          this.logger.warn(
            `Could not remove stale repeatable ${name} (key=${job.key}): ` +
              `${(removeErr as Error).message} -- continuing`,
          );
        }
      }

      await this.queue.add(name, {}, { repeat: { cron }, removeOnComplete: true });
      this.logger.log(`Registered cron ${name} (${cron})`);
    } catch (e) {
      this.logger.warn(`Failed to register ${name} cron: ${(e as Error).message}`);
    }
  }

  /**
   * Sends a Slack alert when a compliance job dead-letters. Uses the same
   * QUEUE_ALERT_SLACK_WEBHOOK_URL env var as DlqMonitorService, falling back
   * to a log warning so the failure is still observable without Slack.
   */
  private async sendDeadLetterAlert(job: Job | undefined, err: Error): Promise<void> {
    const webhookUrl = process.env.QUEUE_ALERT_SLACK_WEBHOOK_URL;
    const jobName = job?.name ?? 'unknown';
    const text =
      `:rotating_light: *Compliance job dead-lettered*: \`${jobName}\`` +
      ` (id=${job?.id ?? '?'}, attempts=${job?.attemptsMade ?? '?'})\n>${err.message}`;

    if (!webhookUrl) {
      this.logger.warn(`Compliance dead-letter alert (no QUEUE_ALERT_SLACK_WEBHOOK_URL): ${text}`);
      return;
    }
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.error(`Slack compliance alert failed: HTTP ${res.status}`);
      }
    } catch (fetchErr) {
      this.logger.error(`Slack compliance alert failed: ${(fetchErr as Error).message}`);
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

  @Process({ name: VERIFICATION_SCAN_JOB, concurrency: 1 })
  async runVerificationScan() {
    const r = await this.verification.runVerificationScan();
    this.logger.log(
      `verification-scan: renewalNotified=${r.renewalNotified} suspended=${r.suspended}`,
    );
    return r;
  }

  @Process({ name: FSA_REFRESH_JOB, concurrency: 1 })
  async runFsaRefresh() {
    const r = await this.verification.runFsaRefresh();
    this.logger.log(`fsa-refresh: updated=${r.updated}`);
    return r;
  }

  @OnQueueFailed()
  onFailed(job: Job | undefined, err: Error): void {
    if (shouldReportQueueFailure(job, err)) {
      Sentry.captureException(err, {
        tags: { queue: COMPLIANCE_QUEUE, jobName: job?.name ?? 'unknown' },
        extra: { jobId: job?.id, attemptsMade: job?.attemptsMade },
      });
      // Also page via Slack so compliance failures surface in real time,
      // not just in the next daily email digest.
      void this.sendDeadLetterAlert(job, err);
    }
    this.logger.error(
      `[${COMPLIANCE_QUEUE}] job ${job?.id ?? '?'} (${job?.name ?? '?'}) failed (attempt ${job?.attemptsMade ?? '?'}): ${err.message}`,
    );
  }
}
