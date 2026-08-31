import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Queue } from 'bull';

import { PrismaService } from '../../prisma/prisma.service';
import { STRIPE_WEBHOOK_QUEUE } from '../../queues/queues.module';

const JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: 1000,
  removeOnFail: 1000,
};

@Injectable()
export class StripeWebhookDeliveryService implements OnModuleInit {
  private readonly logger = new Logger(StripeWebhookDeliveryService.name);
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(STRIPE_WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    const timer = setInterval(() => void this.recover(), 60_000);
    timer.unref();
    this.logger.log('Stripe webhook claim recovery registered (every 60s)');
  }

  async deliver(claimId: string): Promise<boolean> {
    const claimed = await this.prisma.processedWebhookEvent.updateMany({
      where: {
        id: claimId,
        status: { in: ['claimed', 'enqueue_failed'] },
      },
      data: {
        status: 'enqueueing',
        enqueueAttempts: { increment: 1 },
        lastError: null,
      },
    });
    if (claimed.count !== 1) return false;

    const row = await this.prisma.processedWebhookEvent.findUnique({
      where: { id: claimId },
    });
    if (!row?.payload) return false;

    try {
      await this.queue.add(row.eventType, row.payload as Record<string, unknown>, {
        ...JOB_OPTIONS,
        jobId: row.stripeEventId,
      });
      await this.prisma.processedWebhookEvent.updateMany({
        where: { id: claimId, status: { not: 'processed' } },
        data: { status: 'queued', queuedAt: new Date(), lastError: null },
      });
      return true;
    } catch (error) {
      const message = (error as Error).message;
      const delayMs = Math.min(2 ** row.enqueueAttempts * 60_000, 30 * 60_000);
      await this.prisma.processedWebhookEvent.updateMany({
        where: { id: claimId, status: { not: 'processed' } },
        data: {
          status: 'enqueue_failed',
          lastError: message,
          nextAttemptAt: new Date(Date.now() + delayMs),
        },
      });
      Sentry.captureMessage(
        `Stripe webhook ${row.stripeEventId} claimed but queue handoff failed; recovery scheduled`,
        'error',
      );
      throw error;
    }
  }

  async recover(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const stale = new Date(Date.now() - 5 * 60_000);
      const due = await this.prisma.processedWebhookEvent.findMany({
        where: {
          OR: [
            { status: 'enqueue_failed', nextAttemptAt: { lte: new Date() } },
            { status: 'claimed', claimedAt: { lte: stale } },
            { status: 'enqueueing', updatedAt: { lte: stale } },
          ],
        },
        orderBy: { claimedAt: 'asc' },
        take: 50,
      });
      for (const row of due) {
        if (row.status === 'enqueueing') {
          await this.prisma.processedWebhookEvent.updateMany({
            where: { id: row.id, status: 'enqueueing', updatedAt: { lte: stale } },
            data: { status: 'enqueue_failed', nextAttemptAt: new Date() },
          });
        }
        await this.deliver(row.id).catch((error) => {
          this.logger.error(
            `Stripe webhook recovery failed for ${row.stripeEventId}: ${(error as Error).message}`,
          );
        });
      }
    } finally {
      this.draining = false;
    }
  }
}
