import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bull';

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
  ) {}

  onApplicationBootstrap(): void {
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

  @Process(COMPLIANCE_SCAN_JOB)
  async runComplianceScan() {
    const r = await this.compliance.runComplianceScan();
    this.logger.log(`compliance-scan: expiring=${r.expiringNotified} expired=${r.expiredNotified}`);
    return r;
  }

  @Process(REVIEW_TRIGGER_JOB)
  async runReviewTrigger() {
    const r = await this.compliance.runReviewTrigger();
    this.logger.log(`review-trigger: requested=${r.requested}`);
    return r;
  }

  @Process(BADGE_RECALC_JOB)
  async runBadgeRecalc() {
    const r = await this.compliance.runBadgeRecalc();
    this.logger.log(`badge-recalc: updated=${r.updated}`);
    return r;
  }
}
