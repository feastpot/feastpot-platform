import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type { Queue } from 'bull';

import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATIONS_QUEUE } from '../../queues/queues.module';

import { assertNotificationEventName, type NotificationEventName } from './notification-events';

/**
 * Lightweight wrapper that other modules can inject instead of `@InjectQueue`
 * directly. Keeps the queue-name constant in one place and gives us a single
 * spot to add cross-cutting concerns (rate-limit per-user, dedupe, etc.).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Enqueue an event by name. The processor looks up the template + delivers.
   *
   * Pass `jobId` for deterministic dedupe: BullMQ will refuse a second job
   * with the same id while the original is in the queue/active set. Useful
   * for cron-driven enqueues (e.g. review_request:<orderId>) so multiple
   * cron ticks within the BullMQ job-retention window can't double-send.
   */
  async enqueue(
    eventName: NotificationEventName | string,
    data: Record<string, unknown>,
    opts?: { jobId?: string },
  ): Promise<void> {
    assertNotificationEventName(eventName);
    // When REDIS_URL is unset/down the injected BullMQ Queue is configured
    // with lazyConnect+enableOfflineQueue:false (see app.module.ts), so the
    // very first add() throws "Connection is closed." and would 500 the
    // controller. Never fail the synchronous user-facing flow because of a
    // notification - but never DROP the notification either: on enqueue
    // failure the event is persisted to notification_outbox and a cron
    // (NotificationOutboxService) retries until the queue is back.
    try {
      await this.queue.add(eventName, data, opts?.jobId ? { jobId: opts.jobId } : undefined);
    } catch (e) {
      const message = (e as Error).message;
      this.logger.warn(`enqueue(${eventName}) failed: ${message} - falling back to outbox`);
      try {
        await this.prisma.notificationOutbox.create({
          data: {
            eventName,
            payload: data as Prisma.JsonObject,
            jobId: opts?.jobId ?? null,
            lastError: message,
          },
        });
        Sentry.captureMessage(
          `Notification enqueue failed for ${eventName}; persisted to outbox for retry`,
          'warning',
        );
      } catch (dbErr) {
        // Queue AND DB both failed - this notification is genuinely lost.
        // Loudest possible signal so ops can replay it manually.
        this.logger.error(
          `enqueue(${eventName}) failed AND outbox write failed: ${(dbErr as Error).message}`,
        );
        Sentry.captureException(dbErr, {
          tags: { area: 'notification-outbox' },
          extra: { eventName, payload: data, queueError: message },
        });
      }
    }
  }

  /**
   * Persist a notification in the caller's transaction.  The caller must
   * dispatch the returned row after its transaction commits; keeping the row
   * in the transaction means an action can never commit without a retryable
   * notice record.
   */
  createTransactionalOutbox(
    tx: Prisma.TransactionClient,
    eventName: NotificationEventName | string,
    data: Record<string, unknown>,
    jobId?: string,
  ) {
    assertNotificationEventName(eventName);
    return tx.notificationOutbox.create({
      data: {
        eventName,
        payload: data as Prisma.JsonObject,
        jobId: jobId ?? null,
      },
      select: { id: true },
    });
  }

  /**
   * Dispatch a row created in the same transaction as its business action.
   * Failure intentionally leaves the row for NotificationOutboxService.
   */
  async dispatchTransactionalOutbox(
    outboxId: string,
    eventName: NotificationEventName | string,
    data: Record<string, unknown>,
    jobId?: string,
  ): Promise<void> {
    assertNotificationEventName(eventName);
    try {
      await this.queue.add(eventName, data, jobId ? { jobId } : undefined);
      await this.prisma.notificationOutbox.delete({ where: { id: outboxId } });
    } catch (error) {
      this.logger.warn(
        `Transactional notification ${eventName} could not be dispatched: ${(error as Error).message}; outbox will retry`,
      );
    }
  }
}
