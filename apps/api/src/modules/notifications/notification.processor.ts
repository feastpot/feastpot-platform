import { InjectQueue, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { AmendmentStatus, NotificationChannel, NotificationStatus, OrderStatus, Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type { Job, Queue } from 'bull';

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
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
  ) {}

  /**
   * Concurrency=20: email/SMS/push are I/O-bound (provider API calls), so
   * we can run many in parallel without saturating CPU. Bumped from 10
   * to absorb the Friday 17:00–20:00 order-confirmation burst (~115/hr ×
   * up to 4 channels each).
   */
  @Process({ concurrency: 20 })
  async handle(job: Job<NotificationJobData>): Promise<{ sent: Channel[]; skipped: Channel[] }> {
    const eventName = job.name;

    // System jobs that don't render a notification themselves — they mutate
    // state (and may enqueue follow-up template-backed notifications).
    if (eventName === 'expire_amendment') {
      await this.handleExpireAmendment(job.data as { amendmentId?: string });
      return { sent: [], skipped: [] };
    }
    if (eventName === 'eta_overdue') {
      await this.handleEtaOverdue(job.data as { orderId?: string });
      return { sent: [], skipped: [] };
    }

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
        const ok = await this.dispatch(channel, {
          user,
          subject,
          html,
          data,
          template: template.whatsappTemplate,
          smsBody: template.sms ? template.sms(data) : undefined,
        });
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

  /**
   * Auto-resolve a pending amendment after its TTL elapses. Idempotent: a
   * non-pending row is left alone, so a customer response that lands first
   * always wins.
   */
  private async handleExpireAmendment(data: { amendmentId?: string }): Promise<void> {
    if (!data.amendmentId) return;
    const result = await this.prisma.orderAmendment.updateMany({
      where: { id: data.amendmentId, status: AmendmentStatus.pending },
      data: { status: AmendmentStatus.expired, respondedAt: new Date() },
    });
    if (result.count > 0) {
      this.logger.log(`Auto-expired amendment ${data.amendmentId}`);
    }
  }

  /**
   * Fired after vendor's ETA + grace window. Only nags the customer if the
   * order is still in-flight (not yet delivered/cancelled).
   */
  private async handleEtaOverdue(data: { orderId?: string }): Promise<void> {
    if (!data.orderId) return;
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      select: { id: true, status: true, customerId: true, orderNumber: true, etaAt: true, vendor: { select: { businessName: true } } },
    });
    if (!order) return;
    if (order.status === OrderStatus.delivered || order.status === OrderStatus.cancelled || order.status === OrderStatus.refunded) {
      return;
    }
    await this.notifications.add(
      'order_eta_overdue',
      {
        userId: order.customerId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        vendorName: order.vendor?.businessName,
        etaAt: order.etaAt?.toISOString(),
      },
      { jobId: `order_eta_overdue:${order.id}` },
    );
  }

  /**
   * Bull v4 hook fired after a job has exhausted its retries. We forward the
   * error to Sentry with structured `extra` so the issue groups by queue
   * and job name in the Sentry UI — much faster triage than scrubbing
   * stdout for stack traces.
   */
  @OnQueueFailed()
  onFailed(job: Job<NotificationJobData> | undefined, err: Error): void {
    // Bull v4 fires this on EVERY attempt failure. Only escalate to Sentry
    // once retries are exhausted — otherwise a flaky downstream (e.g.
    // Twilio) creates 3× the alert volume during incidents.
    const exhausted =
      !job || job.attemptsMade >= ((job.opts?.attempts ?? 1) as number);
    if (exhausted) {
      Sentry.captureException(err, {
        tags: { queue: NOTIFICATIONS_QUEUE, jobName: job?.name ?? 'unknown' },
        extra: { jobId: job?.id, attemptsMade: job?.attemptsMade, data: job?.data },
      });
    }
    this.logger.error(
      `[${NOTIFICATIONS_QUEUE}] job ${job?.id ?? '?'} (${job?.name ?? '?'}) failed (attempt ${job?.attemptsMade ?? '?'}): ${err.message}`,
    );
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
      smsBody: string | undefined;
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
      // Prefer the template's plain-text SMS body (e.g. "Feastpot: Order
      // confirmed with X. Track: …") and fall back to the email subject
      // so we never send empty messages even for events that haven't
      // declared a dedicated `sms()` renderer yet.
      const body = ctx.smsBody ?? ctx.subject;
      const r = await this.sms.send({ to: ctx.user.phone ?? '', body });
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
