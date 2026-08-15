import { InjectQueue, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import {
  AmendmentStatus,
  NotificationChannel,
  NotificationStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type { Job, Queue } from 'bull';

import { PrismaService } from '../../prisma/prisma.service';
import { shouldReportQueueFailure } from '../../queues/queue-failure';
import { NOTIFICATIONS_QUEUE } from '../../queues/queues.module';

import { findPreferenceDefinition } from './notification-preferences.constants';
import { EmailProvider, type EmailAttachment } from './providers/email.provider';
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
 * Per-event WhatsApp Content Template parameter builders.
 *
 * The default builder (see `dispatch`) sends a 3-slot generic shape
 * `[firstName, orderNumber, amount]` that fits every order-related
 * event. Templates whose data shape doesn't match (e.g. payouts have
 * no orderNumber but DO have an amount) need a bespoke builder so the
 * Twilio Content Template variables `{{1}}`, `{{2}}`, ... line up with
 * the right values.
 *
 * Each builder returns a positional array; index 0 becomes `{{1}}`,
 * index 1 becomes `{{2}}`, and so on. Keep the body of the matching
 * Twilio template in sync with the returned positions or the customer
 * sees blank variables.
 */
const formatPounds = (pence: unknown): string =>
  typeof pence === 'number' ? `£${(pence / 100).toFixed(2)}` : '';

/** {{1}} = firstName, {{2}} = order number - the approved shape for all order-lifecycle templates. */
const nameAndOrderNumber = (
  firstName: string,
  data: Record<string, unknown>,
): Array<string | number> => [firstName, String(data.orderNumber ?? '')];

/** {{1}} = firstName only - the approved shape for the event_* templates. */
const nameOnly = (firstName: string): Array<string | number> => [firstName];

/**
 * Keyed by the Twilio Content Template name (`template.whatsappTemplate`,
 * the same key used to resolve TWILIO_CONTENT_SID_<name>), NOT the internal
 * event name - several events share one approved template and the two keys
 * diverge (e.g. event `payout_batch_ready` sends template `payout_statement`).
 *
 * Verified against the approved Twilio Content Templates (Content API,
 * Jul 2026). Meta enforces EXACT parameter counts, so each builder must
 * return precisely as many values as the approved body has {{n}} slots -
 * extra or missing variables make the send fail, not just render blank.
 */
export const WHATSAPP_PARAMS: Record<
  string,
  (firstName: string, data: Record<string, unknown>) => Array<string | number>
> = {
  // 2 slots: {{1}} = firstName, {{2}} = formatted £ net payout
  payout_statement: (firstName, data) => [
    firstName,
    formatPounds(data.amountPence ?? data.netPence),
  ],
  // 2 slots: {{1}} = firstName, {{2}} = order number (approved bodies carry
  // no amount slot - totals live in the email/SMS copies).
  order_confirmation: nameAndOrderNumber,
  order_accepted: nameAndOrderNumber,
  order_dispatched: nameAndOrderNumber,
  delivery_confirmed: nameAndOrderNumber,
  order_amendment_proposed: nameAndOrderNumber,
  review_request: nameAndOrderNumber,
  // 1 slot: {{1}} = firstName
  event_quote_received: nameOnly,
  event_reminder_72h: nameOnly,
  event_balance_link: nameOnly,
};

/**
 * Notifications queue processor.
 *
 * Concurrency=10 set via `@Process({ concurrency: 10 })` per channel handler.
 * Bull's catch-all (no name) is used here so any event the rest of the app
 * enqueues by name (e.g. `notifications.add('order_confirmation', ...)`) is
 * routed through the template registry. Unknown events are logged and dropped
 * - never re-tried indefinitely (would block the queue).
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
   * Concurrency=30: email/SMS/push are I/O-bound (provider API calls), so
   * we can run many in parallel without saturating CPU. Sized for the
   * 500-vendor / 10k-orders-per-day target - at peak (~1,200 orders/hr
   * × up to 4 channels) we need to drain ~80 jobs/min sustained with
   * headroom for the delivery-notification wave that follows ~45 min
   * later.
   */
  @Process({ concurrency: 30 })
  async handle(job: Job<NotificationJobData>): Promise<{ sent: Channel[]; skipped: Channel[] }> {
    const eventName = job.name;

    // System jobs that don't render a notification themselves - they mutate
    // state (and may enqueue follow-up template-backed notifications).
    if (eventName === 'expire_amendment') {
      await this.handleExpireAmendment(job.data as { amendmentId?: string });
      return { sent: [], skipped: [] };
    }
    if (eventName === 'eta_overdue') {
      await this.handleEtaOverdue(job.data as { orderId?: string });
      return { sent: [], skipped: [] };
    }

    // Raw email jobs (e.g. vendor-application emails) bypass the user-centric
    // template system. They carry { to, subject, html } directly and are
    // retried by Bull's normal backoff when they fail.
    // payout_batch_ready: email with optional PDF attachment + WhatsApp.
    // Handled before the generic template path because the email channel needs
    // to carry a PDF attachment which the generic dispatch() does not support.
    if (eventName === 'payout_batch_ready') {
      return this.handlePayoutBatchReady(job.data);
    }

    if (eventName === 'vendor_application_email_raw') {
      const {
        to,
        subject: rawSubject,
        html: rawHtml,
      } = job.data as {
        to?: string;
        subject?: string;
        html?: string;
      };
      if (!to || !rawSubject?.trim() || !rawHtml?.trim()) {
        this.logger.warn(
          `vendor_application_email_raw job ${job.id}: missing to/subject/html - dropping.`,
        );
        return { sent: [], skipped: [] };
      }
      const r = await this.email.send({ to, subject: rawSubject, html: rawHtml });
      this.logger.log(`vendor_application_email_raw → ${to}: delivered=${r.delivered}`);
      return { sent: r.delivered ? ['email' as Channel] : [], skipped: [] };
    }

    const template = getTemplate(eventName);
    if (!template) {
      this.logger.warn(`No template for event "${eventName}" - dropping (no retry).`);
      return { sent: [], skipped: [] };
    }

    const data = job.data ?? {};
    const userId = this.resolveUserId(data);
    if (!userId) {
      this.logger.warn(`Event "${eventName}" missing userId/recipient - dropping.`);
      return { sent: [], skipped: [] };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, firstName: true },
    });
    if (!user) {
      this.logger.warn(`Event "${eventName}" user ${userId} not found - dropping.`);
      return { sent: [], skipped: [] };
    }

    const subject = template.subject(data);
    const html = template.render(data);

    // Content validation: an empty subject or body indicates a broken template
    // or missing data. Drop rather than send a blank email - it degrades trust
    // more than silence. The dropped event is logged so ops can investigate.
    if (!subject?.trim() || !html?.trim()) {
      this.logger.warn(
        `Event "${eventName}" produced empty subject or html for user ${userId} - dropping (template bug or missing data).`,
      );
      Sentry.captureMessage(
        `Notification template "${eventName}" rendered empty content for user ${userId}`,
        'warning',
      );
      return { sent: [], skipped: [] };
    }

    const sent: Channel[] = [];
    const skipped: Channel[] = [];

    const enabledChannels = await this.filterEnabledChannels(user.id, eventName, template.channels);

    for (const channel of template.channels) {
      if (!enabledChannels.includes(channel)) {
        // Recipient has opted this (event, channel) out - not an error, skip it.
        skipped.push(channel);
        continue;
      }
      try {
        const ok = await this.dispatch(channel, {
          eventName,
          user,
          subject,
          html,
          data,
          template: template.whatsappTemplate,
          smsBody: template.sms ? template.sms(data) : undefined,
        });
        if (ok) {
          sent.push(channel);
          await this.recordNotification(
            user.id,
            channel,
            eventName,
            subject,
            html,
            NotificationStatus.sent,
            data,
          );
        } else {
          skipped.push(channel);
        }
      } catch (e) {
        this.logger.error(
          `Channel ${channel} failed for event "${eventName}": ${(e as Error).message}`,
        );
        await this.recordNotification(
          user.id,
          channel,
          eventName,
          subject,
          html,
          NotificationStatus.failed,
          data,
        );
        // Re-throw so BullMQ retries the WHOLE job (all channels). Acceptable
        // because each channel's send is itself idempotent on the provider side
        // (Stripe-style: same event, same content) - duplicates are tolerable
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
  /**
   * payout_batch_ready: sends email (with PDF statement attachment if present)
   * + WhatsApp (no attachment). Isolated from the generic template path so we
   * can pass attachments to EmailProvider without touching every other handler.
   */
  private async handlePayoutBatchReady(
    data: NotificationJobData,
  ): Promise<{ sent: Channel[]; skipped: Channel[] }> {
    const userId = this.resolveUserId(data);
    if (!userId) {
      this.logger.warn('payout_batch_ready: missing vendorUserId - dropping');
      return { sent: [], skipped: [] };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, firstName: true },
    });
    if (!user) {
      this.logger.warn(`payout_batch_ready: user ${userId} not found - dropping`);
      return { sent: [], skipped: [] };
    }

    const template = getTemplate('payout_batch_ready');
    if (!template) {
      this.logger.warn('payout_batch_ready: no template registered - dropping');
      return { sent: [], skipped: [] };
    }
    const subject = template.subject(data);
    const html = template.render(data);

    const sent: Channel[] = [];
    const skipped: Channel[] = [];

    // ─── Email (with PDF attachment when provided) ────────────────────────
    const enabledChannels = await this.filterEnabledChannels(
      user.id,
      'payout_batch_ready',
      template.channels,
    );
    if (enabledChannels.includes('email')) {
      try {
        const attachments: EmailAttachment[] = [];
        if (typeof data.pdfBase64 === 'string' && typeof data.pdfFilename === 'string') {
          attachments.push({
            content: Buffer.from(data.pdfBase64, 'base64'),
            filename: data.pdfFilename,
          });
        }
        const r = await this.email.send({ to: user.email, subject, html, attachments });
        if (r.delivered) {
          sent.push('email');
          await this.recordNotification(
            user.id,
            'email',
            'payout_batch_ready',
            subject,
            html,
            NotificationStatus.sent,
            data,
          );
        } else {
          skipped.push('email');
        }
      } catch (e) {
        await this.recordNotification(
          user.id,
          'email',
          'payout_batch_ready',
          subject,
          html,
          NotificationStatus.failed,
          data,
        );
        throw e; // BullMQ retries
      }
    } else {
      skipped.push('email');
    }

    // ─── WhatsApp (no attachment) ────────────────────────────────────────
    if (enabledChannels.includes('whatsapp')) {
      try {
        const ok = await this.dispatch('whatsapp', {
          eventName: 'payout_batch_ready',
          user,
          subject,
          html,
          data,
          template: template.whatsappTemplate,
          smsBody: template.sms ? template.sms(data) : undefined,
        });
        if (ok) {
          sent.push('whatsapp');
          await this.recordNotification(
            user.id,
            'whatsapp',
            'payout_batch_ready',
            subject,
            '',
            NotificationStatus.sent,
            data,
          );
        } else {
          skipped.push('whatsapp');
        }
      } catch (e) {
        this.logger.warn(
          `payout_batch_ready WhatsApp failed for ${userId}: ${(e as Error).message}`,
        );
        skipped.push('whatsapp');
        // Don't rethrow - email already sent, don't retry the whole job for WA
      }
    } else {
      skipped.push('whatsapp');
    }

    return { sent, skipped };
  }

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
      select: {
        id: true,
        status: true,
        customerId: true,
        orderNumber: true,
        etaAt: true,
        vendor: { select: { businessName: true } },
      },
    });
    if (!order) return;
    if (
      order.status === OrderStatus.delivered ||
      order.status === OrderStatus.cancelled ||
      order.status === OrderStatus.refunded
    ) {
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
   * and job name in the Sentry UI - much faster triage than scrubbing
   * stdout for stack traces.
   */
  @OnQueueFailed()
  onFailed(job: Job<NotificationJobData> | undefined, err: Error): void {
    // Bull v4 fires this on EVERY attempt failure. Only escalate to Sentry
    // once retries are exhausted (or the job was force-failed as stalled) -
    // otherwise a flaky downstream (e.g. Twilio) creates 3× the alert volume
    // during incidents.
    if (shouldReportQueueFailure(job, err)) {
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
    return (data.userId ?? data.customerId ?? data.vendorUserId ?? data.recipientUserId) as
      | string
      | undefined;
  }

  /**
   * Narrow a template's channels to the ones the recipient still wants for this
   * event:
   *   - transactional (event, channel) pairs are always delivered (legal / order
   *     fulfilment) and ignore any stored row;
   *   - a pair the user has explicitly toggled uses that stored value;
   *   - otherwise the coded default applies, and an event NOT in the preference
   *     registry at all (admin / vendor ops alerts, payouts, etc.) always sends.
   * One query covers every channel for the event.
   */
  private async filterEnabledChannels(
    userId: string,
    eventName: string,
    channels: readonly Channel[],
  ): Promise<Channel[]> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId, key: eventName },
      select: { channel: true, enabled: true },
    });
    const stored = new Map(rows.map((r) => [r.channel, r.enabled]));

    return channels.filter((channel) => {
      const def = findPreferenceDefinition(eventName, channel);
      if (!def) return true;
      if (def.transactional) return true;
      return stored.get(channel) ?? def.defaultEnabled;
    });
  }

  private async dispatch(
    channel: Channel,
    ctx: {
      eventName: string;
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
      // Per-template builder wins (keyed by the Twilio Content Template
      // name so it matches the approved {{n}} slot layout exactly);
      // unknown templates fall back to the 3-slot generic shape.
      const firstName = ctx.user.firstName ?? 'there';
      const builder = WHATSAPP_PARAMS[ctx.template];
      const params = builder
        ? builder(firstName, ctx.data)
        : [
            firstName,
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
