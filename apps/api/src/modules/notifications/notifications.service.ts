import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bull';

import { NOTIFICATIONS_QUEUE } from '../../queues/queues.module';

/**
 * Lightweight wrapper that other modules can inject instead of `@InjectQueue`
 * directly. Keeps the queue-name constant in one place and gives us a single
 * spot to add cross-cutting concerns (rate-limit per-user, dedupe, etc.).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue) {}

  /**
   * Enqueue an event by name. The processor looks up the template + delivers.
   *
   * Pass `jobId` for deterministic dedupe: BullMQ will refuse a second job
   * with the same id while the original is in the queue/active set. Useful
   * for cron-driven enqueues (e.g. review_request:<orderId>) so multiple
   * cron ticks within the BullMQ job-retention window can't double-send.
   */
  async enqueue(
    eventName: string,
    data: Record<string, unknown>,
    opts?: { jobId?: string },
  ): Promise<void> {
    // Best-effort: when REDIS_URL is unset the injected BullMQ Queue is
    // configured with lazyConnect+enableOfflineQueue:false (see app.module.ts),
    // so the very first add() throws "Connection is closed." and 500s the
    // controller. Notifications are observability/comms, never source of
    // truth — the row that triggered the notification is already committed
    // by the time we get here. Log and swallow so a Redis outage can't take
    // down the synchronous user-facing flow (dispute create, review create,
    // payout transfer, etc.).
    try {
      await this.queue.add(eventName, data, opts?.jobId ? { jobId: opts.jobId } : undefined);
    } catch (e) {
      this.logger.warn(`enqueue(${eventName}) failed: ${(e as Error).message}`);
    }
  }
}
