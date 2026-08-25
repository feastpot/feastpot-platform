import { Process, Processor } from '@nestjs/bull';
import { OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'bull';

import { ATTRIBUTION_QR_QUEUE } from '../../queues/queues.module';

import { BACKFILL_REFERRAL_QR_JOB, GENERATE_REFERRAL_QR_JOB } from './attribution-qr.jobs';
import { AttributionService } from './attribution.service';

@Processor(ATTRIBUTION_QR_QUEUE)
export class AttributionQrProcessor implements OnApplicationBootstrap {
  constructor(private readonly attribution: AttributionService) {}

  onApplicationBootstrap(): void {
    // One small discovery job makes pre-existing NULL rows recover without
    // putting an unbounded scan on a web request.
    void this.attribution.enqueueQrBackfill();
  }

  @Process({ name: GENERATE_REFERRAL_QR_JOB, concurrency: 2 })
  async generate(job: Job<{ linkId: string }>) {
    return this.attribution.generateQrIfMissing(job.data.linkId);
  }

  @Process({ name: BACKFILL_REFERRAL_QR_JOB, concurrency: 1 })
  async backfill() {
    // Keep discovery bounded. Individual deterministic jobs do the expensive
    // rendering, and the next boot/admin invocation safely discovers more.
    const links = await this.attribution.findMissingQrLinks(100);
    await Promise.all(links.map((link) => this.attribution.enqueueQrGeneration(link.id)));
    if (links.length === 100) await this.attribution.enqueueQrBackfill(true);
    return { queued: links.length };
  }
}
