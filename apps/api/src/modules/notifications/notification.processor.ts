import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import type { Job } from 'bull';

import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATIONS_QUEUE } from '../../queues/queues.module';

import { EmailProvider } from './providers/email.provider';
import { PushProvider } from './providers/push.provider';
import { SmsProvider } from './providers/sms.provider';
import { WhatsappProvider } from './providers/whatsapp.provider';
import { getTemplate, type Channel } from './templates';

/**
 * The job payload other modules enqueue. The job NAME is the event name
 * (e.g. 'order_confirmed', 'refund_issued_customer'). The processor looks up
 * the template + recipient, then dispatches per-channel.
 */
export interface NotificationJobData {
  /** Recipient. Either userId (preferred) or explicit overrides. */
  userId?: string;
  /** Per-event payload merged into the template render(). */
  [key: string]: unknown;
}

const CHANNEL_TO_DB: Record<Channel, NotificationChannel> = {
  email: NotificationChannel.email,
  whatsapp: NotificationChannel.whatsapp,
  sms: NotificationChannel.sms,
  push: NotificationChannel.push,
};

/**
 * Notifications queue processor.
 *
 * Concurrency=10 set via `@Process({ concurrency: 10 })` per channel handler.
 * Bull's catch-all (no name) is used here so any event the rest of the app
 * enqueues by name (e.g. `notifications.add('order_confirmation', ...)`) is
 * routed through the template registry. Unknown events are logged and dropped
 * — never re-tried indefinitely (would block the queue).
 */
@Injectable()
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
    private readonly whatsapp: WhatsappProvider,
    private readonly push: PushProvider,
    private readonly sms: SmsProvider,
  ) {}

  @Process({ concurrency: 10 })
  async handle(job: Job<NotificationJobData>): Promise<{ sent: Channel[]; skipped: Channel[] }> {
    const eventName = job.name;
    const template = getTemplate(eventName);
    if (!template) {
      this.logger.warn(`No template for event "${eventName}" — dropping (no retry).`);
      return { sent: [], skipped: [] };
    }

    const data = job.data ?? {};
    const userId = this.resolveUserId(data);
    if (!userId) {
      this.logger.warn(`Event "${eventName}" missing userId/recipient — dropping.`);
      return { sent: [], skipped: [] };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, firstName: true },
    });
    if (!user) {
      this.logger.warn(`Event "${eventName}" user ${userId} not found — dropping.`);
      return { sent: [], skipped: [] };
    }

    const subject = template.subject(data);
    const html = template.render(data);

    const sent: Channel[] = [];
    const skipped: Channel[] = [];

    for (const channel of template.channels) {
      try {
        const ok = await this.dispatch(channel, { user, subject, html, data, template: template.whatsappTemplate });
        if (ok) {
          sent.push(channel);
          await this.recordNotification(user.id, channel, eventName, subject, html, NotificationStatus.sent, data);
        } else {
          skipped.push(channel);
        }
      } catch (e) {
        this.logger.error(`Channel ${channel} failed for event "${eventName}": ${(e as Error).message}`);
        await this.recordNotification(user.id, channel, eventName, subject, html, NotificationStatus.failed, data);
        // Re-throw so BullMQ retries the WHOLE job (all channels). Acceptable
        // because each channel's send is itself idempotent on the provider side
        // (Stripe-style: same event, same content) — duplicates are tolerable
        // for transactional notifications.
        throw e;
      }
    }

    return { sent, skipped };
  }

  private resolveUserId(data: NotificationJobData): string | undefined {
    return (data.userId ?? data.customerId ?? data.vendorUserId ?? data.recipientUserId) as string | undefined;
  }

  private async dispatch(
    channel: Channel,
    ctx: {
      user: { id: string; email: string; phone: string | null; firstName: string | null };
      subject: string;
      html: string;
      data: NotificationJobData;
      template: string | undefined;
    },
  ): Promise<boolean> {
    if (channel === 'email') {
      const r = await this.email.send({ to: ctx.user.email, subject: ctx.subject, html: ctx.html });
      return r.delivered;
    }
    if (channel === 'whatsapp') {
      if (!ctx.user.phone || !ctx.template) return false;
      // WhatsApp template params: pull stringified values from data in declared order.
      // For now we send 3 generic slots (recipient, headline, detail) — extend per template.
      const params = [
        ctx.user.firstName ?? 'there',
        String(ctx.data.orderNumber ?? ctx.data.title ?? ''),
        String(ctx.data.amountPence ? `£${(ctx.data.amountPence as number) / 100}` : ''),
      ];
      const r = await this.whatsapp.send({ to: ctx.user.phone, template: ctx.template, params });
      return r.delivered;
    }
    if (channel === 'push') {
      const r = await this.push.send({
        userId: ctx.user.id,
        title: ctx.subject,
        body: ctx.html.replace(/<[^>]+>/g, '').slice(0, 200),
        url: typeof ctx.data.url === 'string' ? ctx.data.url : undefined,
      });
      return r.delivered > 0;
    }
    if (channel === 'sms') {
      const r = this.sms.send({ to: ctx.user.phone ?? '', body: ctx.subject });
      return r.delivered;
    }
    return false;
  }

  private async recordNotification(
    userId: string,
    channel: Channel,
    template: string,
    subject: string,
    body: string,
    status: NotificationStatus,
    metadata: NotificationJobData,
  ): Promise<void> {
    // Persist a reduced metadata snapshot so downstream dedupe queries
    // (e.g. compliance review-request cron's `metadata.orderId` filter) work.
    // Strip the recipient userId to avoid duplicating it in the row's column.
    const { userId: _omit, ...rest } = metadata;
    await this.prisma.notification
      .create({
        data: {
          userId,
          channel: CHANNEL_TO_DB[channel],
          template,
          subject,
          body: body.slice(0, 10_000),
          status,
          metadata: rest as Prisma.JsonObject,
          sentAt: status === NotificationStatus.sent ? new Date() : null,
        },
      })
      .catch((e: Error) => {
        // Persistence failure must never break delivery accounting.
        this.logger.warn(`Failed to persist notification row: ${e.message}`);
      });
  }
}
