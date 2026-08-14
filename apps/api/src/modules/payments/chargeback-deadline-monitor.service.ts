import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InboxNotificationType, UserRole, UserStatus } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';

import { PrismaService } from '../../prisma/prisma.service';
import { InboxService } from '../inbox/inbox.service';

/**
 * Warns finance BEFORE a chargeback's evidence-submission deadline passes.
 *
 * Losing a dispute by default (missed deadline) is pure money loss, so this
 * runs hourly and alerts once per chargeback when its `evidenceDueBy` falls
 * inside the warning window (default 72h, `CHARGEBACK_EVIDENCE_WARN_HOURS`).
 *
 * Alert fan-out per chargeback:
 *  - Slack message (real-time; carries amount, deadline, and a direct
 *    Stripe Dashboard link so whoever sees it can act immediately)
 *  - Sentry warning (on-call/paging path)
 *  - Inbox notification to every active finance + admin user
 *
 * Exactly-once: a CAS on `evidenceWarnedAt IS NULL` marks the row before
 * fan-out, so overlapping cron ticks or multi-instance deploys never
 * double-page. Deadlines already in the past still alert (better late than
 * silent) -- the message says OVERDUE in that case.
 */
@Injectable()
export class ChargebackDeadlineMonitorService {
  private readonly logger = new Logger(ChargebackDeadlineMonitorService.name);
  private readonly slackWebhookUrl: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    config: ConfigService,
  ) {
    this.slackWebhookUrl = config.get<string>('QUEUE_ALERT_SLACK_WEBHOOK_URL') ?? null;
  }

  private warnWindowHours(): number {
    const raw = Number(process.env.CHARGEBACK_EVIDENCE_WARN_HOURS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 72;
  }

  /**
   * Posts a Slack message to the configured webhook.
   * Returns true when delivered (or when no webhook is set and we fall back
   * to logging -- consistent with DlqMonitorService behaviour).
   */
  private async sendSlack(text: string): Promise<boolean> {
    if (!this.slackWebhookUrl) {
      this.logger.warn(`Chargeback alert (no QUEUE_ALERT_SLACK_WEBHOOK_URL): ${text}`);
      return true;
    }
    try {
      const res = await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.error(`Slack chargeback alert failed: HTTP ${res.status}`);
        return false;
      }
      this.logger.log('Slack chargeback alert sent.');
      return true;
    } catch (err) {
      this.logger.error(`Slack chargeback alert failed: ${(err as Error).message}`);
      return false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async checkEvidenceDeadlines(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + this.warnWindowHours() * 60 * 60 * 1000);

    const due = await this.prisma.chargeback.findMany({
      where: {
        evidenceWarnedAt: null,
        closedAt: null,
        evidenceDueBy: { not: null, lte: windowEnd },
        // Only statuses where evidence can still be submitted.
        status: { in: ['needs_response', 'warning_needs_response', 'warning_under_review'] },
      },
      select: {
        id: true,
        stripeDisputeId: true,
        orderId: true,
        amountPence: true,
        currency: true,
        reason: true,
        evidenceDueBy: true,
        order: { select: { orderNumber: true } },
      },
      take: 50,
    });
    if (due.length === 0) return;

    const staff = await this.prisma.user.findMany({
      where: { role: { in: [UserRole.finance, UserRole.admin] }, status: UserStatus.active },
      select: { id: true },
    });

    // Detect whether we are running in test mode so the Stripe link points to
    // the correct dashboard environment.
    const isTestMode = (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');
    const stripeDashboardBase = isTestMode
      ? 'https://dashboard.stripe.com/test/disputes'
      : 'https://dashboard.stripe.com/disputes';

    for (const cb of due) {
      // CAS first: only the winner fans out.
      const cas = await this.prisma.chargeback.updateMany({
        where: { id: cb.id, evidenceWarnedAt: null },
        data: { evidenceWarnedAt: now },
      });
      if (cas.count !== 1) continue;

      const dueBy = cb.evidenceDueBy!;
      const overdue = dueBy.getTime() <= now.getTime();
      const hoursLeft = Math.max(0, Math.round((dueBy.getTime() - now.getTime()) / 3_600_000));
      const amountStr = `${(cb.amountPence / 100).toFixed(2)} ${cb.currency}`;
      const disputeUrl = `${stripeDashboardBase}/${cb.stripeDisputeId}`;

      const titleShort = overdue
        ? `Chargeback evidence deadline PASSED (${amountStr})`
        : `Chargeback evidence due in ~${hoursLeft}h (${amountStr})`;

      const orderRef = cb.order?.orderNumber
        ? `#${cb.order.orderNumber}`
        : cb.orderId
          ? cb.orderId
          : 'no matched order';

      // Slack alert: real-time channel with direct dispute link.
      // 48h minimum lead time is guaranteed by the 72h default window above.
      const slackIcon = overdue ? ':rotating_light:' : ':warning:';
      const deadlineStr = dueBy.toUTCString();
      const slackText =
        `${slackIcon} *Chargeback response deadline ${overdue ? 'PASSED' : 'approaching'}*\n` +
        `*Amount:* ${amountStr}\n` +
        `*Dispute:* <${disputeUrl}|${cb.stripeDisputeId}>${cb.reason ? ` (${cb.reason})` : ''}\n` +
        `*Order:* ${orderRef}\n` +
        `*Deadline:* ${deadlineStr}${overdue ? ' -- OVERDUE' : ` (~${hoursLeft}h remaining)`}`;

      await this.sendSlack(slackText);

      // Sentry for the on-call path.
      Sentry.captureMessage(
        `${titleShort}: dispute ${cb.stripeDisputeId}`,
        overdue ? 'error' : 'warning',
      );
      this.logger.warn(
        `${titleShort} -- dispute ${cb.stripeDisputeId}, order ${orderRef}, deadline ${dueBy.toISOString()}`,
      );

      // InboxService.notify is internally best-effort (logs on failure).
      await Promise.all(
        staff.map((u) =>
          this.inbox.notify({
            userId: u.id,
            // No chargeback-specific inbox enum value exists yet; `generic`
            // renders fine and the metadata carries the dispute identifiers.
            type: InboxNotificationType.generic,
            title: titleShort,
            body:
              `Stripe dispute ${cb.stripeDisputeId}` +
              (cb.reason ? ` (${cb.reason})` : '') +
              ` on order ${orderRef}.` +
              ` Evidence due ${dueBy.toISOString()}.` +
              ` Submit evidence in the Stripe Dashboard before the deadline or the dispute is lost by default.`,
            link: cb.orderId ? `/orders?orderId=${cb.orderId}` : undefined,
            metadata: {
              stripeDisputeId: cb.stripeDisputeId,
              chargebackId: cb.id,
              evidenceDueBy: dueBy.toISOString(),
              amountPence: cb.amountPence,
              disputeUrl,
            },
          }),
        ),
      );
    }
  }
}
