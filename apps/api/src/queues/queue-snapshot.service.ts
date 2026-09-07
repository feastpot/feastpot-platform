import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bull';

import {
  ATTRIBUTION_QR_QUEUE,
  COMPLIANCE_QUEUE,
  HMRC_QUEUE,
  NOTIFICATIONS_QUEUE,
  PAYOUTS_QUEUE,
  STRIPE_WEBHOOK_QUEUE,
  TERMS_NOTICES_QUEUE,
} from './queues.module';

export interface QueueSnapshot {
  queue: string;
  available: boolean;
  error?: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  oldestWaitingAgeMs: number | null;
}

@Injectable()
export class QueueSnapshotService {
  private readonly logger = new Logger(QueueSnapshotService.name);

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
    @InjectQueue(STRIPE_WEBHOOK_QUEUE) private readonly stripeWebhooks: Queue,
    @InjectQueue(PAYOUTS_QUEUE) private readonly payouts: Queue,
    @InjectQueue(COMPLIANCE_QUEUE) private readonly compliance: Queue,
    @InjectQueue(TERMS_NOTICES_QUEUE) private readonly termsNotices: Queue,
    @InjectQueue(HMRC_QUEUE) private readonly hmrc: Queue,
    @InjectQueue(ATTRIBUTION_QR_QUEUE) private readonly attributionQr: Queue,
  ) {}

  async snapshots(): Promise<QueueSnapshot[]> {
    return Promise.all(
      this.queues.map(async ([queue, instance]) => {
        try {
          const [waiting, active, delayed, failed, oldest] = await Promise.all([
            instance.getWaitingCount(),
            instance.getActiveCount(),
            instance.getDelayedCount(),
            instance.getFailedCount(),
            instance.getWaiting(0, 0),
          ]);
          return {
            queue,
            available: true,
            waiting,
            active,
            delayed,
            failed,
            oldestWaitingAgeMs: oldest[0] ? Math.max(0, Date.now() - oldest[0].timestamp) : null,
          };
        } catch (err) {
          const message = (err as Error).message;
          this.logger.error(`Failed to inspect queue ${queue}: ${message}`);
          return {
            queue,
            available: false,
            error: message.slice(0, 200),
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            oldestWaitingAgeMs: null,
          };
        }
      }),
    );
  }

  private get queues(): Array<[string, Queue]> {
    return [
      [NOTIFICATIONS_QUEUE, this.notifications],
      [STRIPE_WEBHOOK_QUEUE, this.stripeWebhooks],
      [PAYOUTS_QUEUE, this.payouts],
      [COMPLIANCE_QUEUE, this.compliance],
      [TERMS_NOTICES_QUEUE, this.termsNotices],
      [HMRC_QUEUE, this.hmrc],
      [ATTRIBUTION_QR_QUEUE, this.attributionQr],
    ];
  }
}
