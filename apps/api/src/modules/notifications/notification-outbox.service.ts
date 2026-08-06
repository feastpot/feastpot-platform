import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Queue } from 'bull';

import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATIONS_QUEUE } from '../../queues/queues.module';

/**
 * Drains notification_outbox: rows land here when a notification enqueue
 * failed (Redis down) so the event is not silently dropped. Every minute we
 * retry due rows; on success the row is deleted, on failure attempts++ with
 * exponential backoff. After MAX_ALERT_ATTEMPTS we page via Sentry (once per
 * threshold crossing) but keep retrying - the outbox is the source of truth
 * until the enqueue succeeds.
 *
 * Uses setInterval (not Bull) deliberately: this must work precisely when the
 * queue infrastructure is down.
 */
@Injectable()
export class NotificationOutboxService implements OnModuleInit {
  private readonly logger = new Logger(NotificationOutboxService.name);
  private static readonly INTERVAL_MS = 60_000;
  private static readonly BATCH_SIZE = 50;
  private static readonly MAX_ALERT_ATTEMPTS = 5;
  private draining = false;
  private backlogAlerted = false;

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    const timer = setInterval(() => void this.drain(), NotificationOutboxService.INTERVAL_MS);
    timer.unref();
    this.logger.log('Notification outbox drainer registered (every 60s)');
  }

  /** Exposed for tests. */
  async drain(): Promise<void> {
    if (this.draining) return; // no overlapping runs
    this.draining = true;
    try {
      const due = await this.prisma.notificationOutbox.findMany({
        where: { nextAttemptAt: { lte: new Date() } },
        orderBy: { createdAt: 'asc' },
        take: NotificationOutboxService.BATCH_SIZE,
      });
      if (due.length >= NotificationOutboxService.BATCH_SIZE && !this.backlogAlerted) {
        this.backlogAlerted = true;
        Sentry.captureMessage(
          `Notification outbox backlog at/above ${NotificationOutboxService.BATCH_SIZE} rows - queue likely down for an extended period`,
          'error',
        );
      } else if (due.length === 0) {
        this.backlogAlerted = false;
      }
      for (const row of due) {
        // ALWAYS enqueue with a deterministic jobId: rows without a caller-
        // provided one get outbox:<rowId>. If the delete below fails after a
        // successful enqueue, the next drain's re-add is deduped by Bull on
        // the same jobId instead of double-sending.
        const jobId = row.jobId ?? `outbox:${row.id}`;
        let enqueued = false;
        try {
          await this.queue.add(row.eventName, row.payload as Record<string, unknown>, { jobId });
          enqueued = true;
          await this.prisma.notificationOutbox.delete({ where: { id: row.id } });
          this.logger.log(
            `Outbox drained: ${row.eventName} (${row.id}) enqueued after ${row.attempts + 1} attempt(s)`,
          );
        } catch (e) {
          if (enqueued) {
            // Enqueue SUCCEEDED, only the delete failed. Do not treat as an
            // enqueue failure - leave the row for the next drain, where the
            // jobId dedupe above absorbs the duplicate add.
            this.logger.error(
              `Outbox row ${row.id} enqueued but delete failed: ${(e as Error).message} - will dedupe on next drain`,
            );
            continue;
          }
          const attempts = row.attempts + 1;
          // Exponential backoff, capped at 30 min.
          const delayMs = Math.min(2 ** attempts * 60_000, 30 * 60_000);
          await this.prisma.notificationOutbox
            .update({
              where: { id: row.id },
              data: {
                attempts,
                lastError: (e as Error).message,
                nextAttemptAt: new Date(Date.now() + delayMs),
              },
            })
            .catch(() => undefined);
          if (attempts === NotificationOutboxService.MAX_ALERT_ATTEMPTS) {
            Sentry.captureMessage(
              `Notification outbox row ${row.id} (${row.eventName}) still failing after ${attempts} attempts: ${(e as Error).message}`,
              'error',
            );
          }
        }
      }
    } catch (e) {
      this.logger.error(`Outbox drain failed: ${(e as Error).message}`);
    } finally {
      this.draining = false;
    }
  }
}
