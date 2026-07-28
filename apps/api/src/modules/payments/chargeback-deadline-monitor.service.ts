import { Injectable, Logger } from '@nestjs/common';
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
 * Alert fan-out:
 *  - Sentry warning (on-call/paging path, mirrors the queue-depth monitor)
 *  - Inbox notification to every active finance + admin user
 *
 * Exactly-once: a CAS on `evidenceWarnedAt IS NULL` marks the row before
 * fan-out, so overlapping cron ticks or multi-instance deploys never
 * double-page. Deadlines already in the past still alert (better late than
 * silent) — the message says OVERDUE in that case.
 */
@Injectable()
export class ChargebackDeadlineMonitorService {
  private readonly logger = new Logger(ChargebackDeadlineMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  private warnWindowHours(): number {
    const raw = Number(process.env.CHARGEBACK_EVIDENCE_WARN_HOURS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 72;
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
      },
      take: 50,
    });
    if (due.length === 0) return;

    const staff = await this.prisma.user.findMany({
      where: { role: { in: [UserRole.finance, UserRole.admin] }, status: UserStatus.active },
      select: { id: true },
    });

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
      const amount = `${(cb.amountPence / 100).toFixed(2)} ${cb.currency}`;
      const title = overdue
        ? `Chargeback evidence deadline PASSED (${amount})`
        : `Chargeback evidence due in ~${hoursLeft}h (${amount})`;
      const body =
        `Stripe dispute ${cb.stripeDisputeId}` +
        (cb.reason ? ` (${cb.reason})` : '') +
        (cb.orderId ? ` on order ${cb.orderId}` : ' — no matched order') +
        `. Evidence due ${dueBy.toISOString()}. Submit evidence in the Stripe Dashboard before the deadline or the dispute is lost by default.`;

      Sentry.captureMessage(`${title}: dispute ${cb.stripeDisputeId}`, overdue ? 'error' : 'warning');
      this.logger.warn(`${title} - ${body}`);

      // InboxService.notify is internally best-effort (logs on failure).
      await Promise.all(
        staff.map((u) =>
          this.inbox.notify({
            userId: u.id,
            // No chargeback-specific inbox enum value exists yet; `generic`
            // renders fine and the metadata carries the dispute identifiers.
            type: InboxNotificationType.generic,
            title,
            body,
            link: cb.orderId ? `/orders?orderId=${cb.orderId}` : undefined,
            metadata: {
              stripeDisputeId: cb.stripeDisputeId,
              chargebackId: cb.id,
              evidenceDueBy: dueBy.toISOString(),
              amountPence: cb.amountPence,
            },
          }),
        ),
      );
    }
  }
}
