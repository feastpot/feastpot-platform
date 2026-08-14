import { InjectQueue } from '@nestjs/bull';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { NotificationStatus, PaymentType, PayoutStatus } from '@prisma/client';
import type { Queue } from 'bull';
import { Resend } from 'resend';

import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  COMPLIANCE_QUEUE,
  HMRC_QUEUE,
  NOTIFICATIONS_QUEUE,
  PAYOUTS_QUEUE,
  STRIPE_WEBHOOK_QUEUE,
  TERMS_NOTICES_QUEUE,
} from '../../queues/queues.module';

import { redactPayload } from './redact-payload';

interface QueueFailureSummary {
  queue: string;
  failed: number;
  lastError: string | null;
}

interface QueueDepthSnapshot {
  queue: string;
  waiting: number;
  failed: number;
}

@Injectable()
export class DlqMonitorService {
  private readonly logger = new Logger(DlqMonitorService.name);
  private readonly resend: Resend | null;
  private readonly alertTo: string;
  private readonly from: string;
  private readonly slackWebhookUrl: string | null;
  private readonly failedThreshold: number;
  private readonly waitingThreshold: number;

  // Alert when a pending order has been waiting for vendor acceptance
  // longer than this threshold. 30 min is aggressive but safe - vendors
  // are expected to accept within 15 min per their SLA.
  private static readonly STUCK_ORDER_MINUTES = 30;

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
    @InjectQueue(STRIPE_WEBHOOK_QUEUE) private readonly stripeWebhooks: Queue,
    @InjectQueue(PAYOUTS_QUEUE) private readonly payouts: Queue,
    @InjectQueue(COMPLIANCE_QUEUE) private readonly compliance: Queue,
    @InjectQueue(TERMS_NOTICES_QUEUE) private readonly termsNotices: Queue,
    @InjectQueue(HMRC_QUEUE) private readonly hmrc: Queue,
    config: ConfigService,
    private readonly cache: RedisCacheService,
    private readonly prisma: PrismaService,
  ) {
    const key = config.get<string>('RESEND_API_KEY');
    this.resend = key ? new Resend(key) : null;
    this.alertTo = config.get<string>('DLQ_ALERT_EMAIL') ?? 'info@feastpot.co.uk';
    this.from = config.get<string>('EMAIL_FROM') ?? 'Feastpot <noreply@feastpot.co.uk>';
    // Real-time alerting (Slack incoming webhook). Optional - when unset we
    // fall back to logging so the cron is still observable in deploy logs.
    this.slackWebhookUrl = config.get<string>('QUEUE_ALERT_SLACK_WEBHOOK_URL') ?? null;
    this.failedThreshold = Number(config.get<string>('QUEUE_ALERT_FAILED_THRESHOLD') ?? '1');
    this.waitingThreshold = Number(config.get<string>('QUEUE_ALERT_WAITING_THRESHOLD') ?? '100');
  }

  /**
   * Every 5 minutes: alert in (near) real time when a queue backs up.
   *
   * Alerting policy (designed against alert fatigue - review finding):
   *  - Alert on a CHANGE, not a standing state: failed-count INCREASE at or
   *    above QUEUE_ALERT_FAILED_THRESHOLD (default 1), or waiting crossing
   *    UP through QUEUE_ALERT_WAITING_THRESHOLD (default 100). Retained
   *    historical failures do not re-page forever.
   *  - A sustained-but-unchanged breach sends at most one hourly reminder,
   *    leased via atomic SET NX EX so concurrent runs can't double-fire.
   *  - The suppression lease is RELEASED if Slack delivery fails, so a
   *    delivery blip doesn't swallow the alert for an hour.
   *
   * Complements (does not replace) the 09:00 daily email digest below.
   */
  @Cron('*/5 * * * *')
  async checkQueueDepths(): Promise<void> {
    if (!this.cache.available) return;

    const snapshots = await this.collectDepths();
    const breaches: string[] = [];
    const leases: string[] = [];

    for (const snap of snapshots) {
      const prev = (await this.cache.get<QueueDepthSnapshot>(`queue-alert:last:${snap.queue}`)) ?? {
        queue: snap.queue,
        waiting: 0,
        failed: 0,
      };
      // Persist the latest observation regardless of alerting outcome (2h TTL
      // so a long Redis outage resets the baseline instead of going stale).
      await this.cache.set(`queue-alert:last:${snap.queue}`, snap, 2 * 60 * 60);

      const failedRose = snap.failed >= this.failedThreshold && snap.failed > prev.failed;
      const failedSustained = snap.failed >= this.failedThreshold && snap.failed <= prev.failed;
      const waitingCrossed =
        snap.waiting >= this.waitingThreshold && prev.waiting < this.waitingThreshold;
      const waitingSustained =
        snap.waiting >= this.waitingThreshold && prev.waiting >= this.waitingThreshold;

      if (
        failedRose ||
        (failedSustained && (await this.acquireLease(`${snap.queue}:failed`, leases)))
      ) {
        breaches.push(
          `\`${snap.queue}\`: *${snap.failed} failed* job(s)${failedRose ? ` (was ${prev.failed})` : ' (ongoing)'}`,
        );
      }
      if (
        waitingCrossed ||
        (waitingSustained && (await this.acquireLease(`${snap.queue}:waiting`, leases)))
      ) {
        breaches.push(
          `\`${snap.queue}\`: *${snap.waiting} waiting* (backlog${waitingCrossed ? '' : ', ongoing'})`,
        );
      }

      // Recovery notice: failed queue drained back to zero after being alerted.
      if (snap.failed === 0 && prev.failed >= this.failedThreshold) {
        breaches.push(
          `\`${snap.queue}\`: :white_check_mark: failed jobs cleared (was ${prev.failed})`,
        );
      }
    }

    if (breaches.length === 0) return;

    const text =
      `:rotating_light: *Feastpot queue alert*\n${breaches.join('\n')}\n` +
      `Inspect via Bull Board: https://api.feastpot.co.uk/admin/queues`;
    const delivered = await this.sendSlack(text);
    if (!delivered) {
      // Release reminder leases so the next run retries instead of waiting
      // out the hour with the alert lost.
      await Promise.all(leases.map((k) => this.cache.del(k)));
    }
  }

  /**
   * Atomically acquire the hourly reminder lease for a sustained breach.
   * Records acquired keys in `leases` so a failed delivery can release them.
   */
  private async acquireLease(key: string, leases: string[]): Promise<boolean> {
    const cacheKey = `queue-alert:lease:${key}`;
    const won = await this.cache.setIfAbsent(cacheKey, 1, 60 * 60);
    if (won) leases.push(cacheKey);
    return won;
  }

  /**
   * Sends a test Slack alert to confirm the webhook is configured and
   * reachable. Called by the admin `POST /admin/slack/test` endpoint so ops
   * can verify the webhook without waiting for a real incident.
   */
  async triggerTestAlert(): Promise<{ delivered: boolean; webhookConfigured: boolean }> {
    const webhookConfigured = Boolean(this.slackWebhookUrl);
    const delivered = await this.sendSlack(
      ':white_check_mark: *Feastpot Slack alert test* -- queue alerts are configured and this webhook is reachable.',
    );
    return { delivered, webhookConfigured };
  }

  /** Returns true when the alert was delivered (or intentionally logged). */
  private async sendSlack(text: string): Promise<boolean> {
    if (!this.slackWebhookUrl) {
      this.logger.warn(`Queue alert (no QUEUE_ALERT_SLACK_WEBHOOK_URL set): ${text}`);
      return true; // logged = delivered as far as retry policy is concerned
    }
    try {
      const res = await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.error(`Slack queue alert failed: HTTP ${res.status}`);
        return false;
      }
      this.logger.log('Slack queue alert sent.');
      return true;
    } catch (err) {
      this.logger.error(`Slack queue alert failed: ${(err as Error).message}`);
      return false;
    }
  }

  private async collectDepths(): Promise<QueueDepthSnapshot[]> {
    const queues = this.allQueues;
    const results: QueueDepthSnapshot[] = [];
    for (const [name, queue] of queues) {
      try {
        const [waiting, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getFailedCount(),
        ]);
        results.push({ queue: name, waiting, failed });
      } catch (err) {
        this.logger.error(`Failed to inspect queue ${name}: ${(err as Error).message}`);
      }
    }
    return results;
  }

  /**
   * Every 5 minutes: alert via Slack when any order has been in `pending`
   * status for more than STUCK_ORDER_MINUTES without vendor acceptance.
   * Each stuck order fires at most one alert per hour (suppressed via Redis).
   */
  @Cron('*/5 * * * *')
  async checkStuckOrders(): Promise<void> {
    if (!this.cache.available) return;

    const cutoff = new Date(Date.now() - DlqMonitorService.STUCK_ORDER_MINUTES * 60_000);
    const stuck = await this.prisma.order
      .findMany({
        where: { status: 'pending', createdAt: { lte: cutoff } },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          vendor: { select: { businessName: true } },
        },
        take: 20,
      })
      .catch(() => [] as never[]);

    if (!stuck.length) return;

    const freshAlerts: string[] = [];
    for (const order of stuck) {
      const key = `stuck-order-alert:${order.id}`;
      const won = await this.cache.setIfAbsent(key, 1, 60 * 60);
      if (won) {
        const ageMin = Math.round((Date.now() - order.createdAt.getTime()) / 60_000);
        freshAlerts.push(
          `• \`${order.orderNumber}\` - *${order.vendor.businessName}* - pending ${ageMin} min`,
        );
      }
    }

    if (!freshAlerts.length) return;

    await this.sendSlack(
      `:alarm_clock: *Stuck orders* (pending >${DlqMonitorService.STUCK_ORDER_MINUTES} min, vendor not yet accepted)\n${freshAlerts.join('\n')}`,
    );
  }

  /** Daily at 09:00 UTC. */
  @Cron('0 9 * * *')
  async checkAndAlert(): Promise<void> {
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable - skipping DLQ scan');
      return;
    }
    const summaries = await this.collectFailures();
    const failing = summaries.filter((s) => s.failed > 0);
    if (failing.length === 0) {
      this.logger.log('DLQ scan: no failed jobs across queues.');
      return;
    }

    const total = failing.reduce((sum, s) => sum + s.failed, 0);
    const subject = `⚠️ Feastpot: ${total} failed jobs in Bull queues`;
    const html = this.renderHtml(failing);

    if (!this.resend) {
      this.logger.warn(
        `DLQ alert (no RESEND_API_KEY, would have emailed ${this.alertTo}): ${subject}`,
      );
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: this.alertTo,
      subject,
      html,
    });
    if (error) {
      this.logger.error(`Failed to send DLQ alert email: ${JSON.stringify(error)}`);
    } else {
      this.logger.log(`DLQ alert sent: ${total} failed jobs across ${failing.length} queue(s).`);
    }
  }

  /**
   * Every hour: alert when any vendor/web/admin route has logged more than
   * ERROR_RATE_THRESHOLD incidents in the previous 60 minutes.
   *
   * With a small vendor base, 3 errors on one route in an hour means a
   * significant portion of the user base is impacted and should not wait for
   * a complaint to surface.
   */
  private static readonly ERROR_RATE_THRESHOLD = 3;

  @Cron('0 * * * *')
  async checkVendorPortalErrorRate(): Promise<void> {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    let hot: Array<{ app: string; route: string; count: bigint }>;
    try {
      hot = await this.prisma.$queryRaw<Array<{ app: string; route: string; count: bigint }>>`
        SELECT app, route, COUNT(*) AS count
        FROM error_incidents
        WHERE created_at >= ${since}
        GROUP BY app, route
        HAVING COUNT(*) >= ${DlqMonitorService.ERROR_RATE_THRESHOLD}
        ORDER BY count DESC
      `;
    } catch (err) {
      this.logger.error(`Error rate check failed: ${(err as Error).message}`);
      return;
    }
    if (hot.length === 0) return;

    const lines = hot
      .map((g) => `  [${g.app}] ${g.route}: ${Number(g.count)} errors`)
      .join('\n');
    const message = `Portal error rate alert:\n${lines}`;

    this.logger.warn(message);

    if (this.slackWebhookUrl) {
      const text =
        `:rotating_light: *Portal error rate alert* :  ${hot.length} route(s) exceeded ` +
        `${DlqMonitorService.ERROR_RATE_THRESHOLD} errors in the last hour:\n` +
        hot.map((g) => `  • \`[${g.app}]\` \`${g.route}\` :  *${Number(g.count)} errors*`).join('\n');
      await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch((e: Error) => {
        this.logger.error(`Slack delivery failed for error rate alert: ${e.message}`);
      });
    }
  }

  // ---------- Financial & notification reconciliation ----------

  /**
   * Runs at :30 of every hour (offset from the error-rate check at :00).
   * Detects three classes of data gaps that can occur if Bull jobs are
   * cleared before they run, or if a processor crashes mid-job:
   *
   *   A) Payouts stuck in `approved` status longer than 30 minutes.
   *      A transfer job should complete (or exhaust retries in ~15 min) well
   *      within this window. A stale `approved` row means the job was cleared
   *      before executing - the cook has not been paid.
   *
   *   B) Notifications stuck in `queued` status for more than 1 hour with no
   *      sent_at. The processor should either send or fail within seconds.
   *      A long-queued notification means its Bull job never ran (or was
   *      cleared after the outbox row was deleted) and the customer/vendor
   *      never received the message.
   *
   *   C) Payment rows of type `refund` or `partial_refund` with no
   *      stripe_refund_id. This indicates a refund ledger row was written
   *      without a corresponding Stripe call completing - money may not have
   *      moved at Stripe. These should be extremely rare and require manual
   *      Stripe dashboard verification.
   *
   * Discrepancies are LOGGED and ALERTED - never auto-remediated. A duplicate
   * refund or double-transfer is worse than a late one.
   */
  @Cron('30 * * * *')
  async checkReconciliation(): Promise<void> {
    const PAYOUT_STALE_MS      = 30 * 60 * 1000; // 30 min
    const NOTIFICATION_STALE_MS = 60 * 60 * 1000; // 1 hour

    const [stalePayouts, stuckNotifications, refundsNoStripeId] = await Promise.all([
      this.prisma.payout
        .findMany({
          where: {
            status: PayoutStatus.approved,
            approvedAt: { lte: new Date(Date.now() - PAYOUT_STALE_MS) },
          },
          select: {
            id: true,
            amountPence: true,
            approvedAt: true,
            vendor: { select: { businessName: true } },
          },
          take: 20,
        })
        .catch((e: Error) => {
          this.logger.error(`Reconciliation: payout query failed: ${e.message}`);
          return [];
        }),

      this.prisma.notification
        .findMany({
          where: {
            status: NotificationStatus.queued,
            sentAt: null,
            createdAt: { lte: new Date(Date.now() - NOTIFICATION_STALE_MS) },
          },
          select: { id: true, channel: true, template: true, createdAt: true, userId: true },
          take: 50,
        })
        .catch((e: Error) => {
          this.logger.error(`Reconciliation: notification query failed: ${e.message}`);
          return [];
        }),

      this.prisma.payment
        .findMany({
          where: {
            type: { in: [PaymentType.refund, PaymentType.partial_refund] },
            stripeRefundId: null,
          },
          select: { id: true, orderId: true, type: true, amountPence: true, createdAt: true },
          take: 20,
        })
        .catch((e: Error) => {
          this.logger.error(`Reconciliation: refund payment query failed: ${e.message}`);
          return [];
        }),
    ]);

    const hasGap =
      stalePayouts.length > 0 ||
      stuckNotifications.length > 0 ||
      refundsNoStripeId.length > 0;

    if (!hasGap) return;

    const lines: string[] = [':warning: *Feastpot financial reconciliation alert*'];

    if (stalePayouts.length > 0) {
      lines.push(
        `\n*Stale approved payouts (>${PAYOUT_STALE_MS / 60_000} min, no transfer):* ${stalePayouts.length}`,
      );
      for (const p of stalePayouts) {
        lines.push(
          `  - \`${p.id}\` ${p.vendor?.businessName ?? 'unknown'} ` +
          `£${(p.amountPence / 100).toFixed(2)} approved at ${p.approvedAt?.toISOString() ?? 'unknown'}`,
        );
      }
      this.logger.warn(
        `Reconciliation: ${stalePayouts.length} payout(s) stuck in approved state`,
        stalePayouts.map((p) => ({ id: p.id, amountPence: p.amountPence, approvedAt: p.approvedAt })),
      );
    }

    if (stuckNotifications.length > 0) {
      lines.push(
        `\n*Stuck queued notifications (>1 hour, no sentAt):* ${stuckNotifications.length}`,
      );
      // Group by template for readability
      const byTemplate = stuckNotifications.reduce<Record<string, typeof stuckNotifications>>(
        (acc, n) => ({ ...acc, [n.template]: [...(acc[n.template] ?? []), n] }),
        {},
      );
      for (const [template, group] of Object.entries(byTemplate)) {
        lines.push(`  - \`${template}\`: ${group.length} notification(s)`);
      }
      this.logger.warn(
        `Reconciliation: ${stuckNotifications.length} notification(s) stuck in queued state`,
        stuckNotifications.map((n) => ({ id: n.id, template: n.template, channel: n.channel, createdAt: n.createdAt })),
      );
    }

    if (refundsNoStripeId.length > 0) {
      lines.push(
        `\n*:rotating_light: Refund payment rows with no Stripe refund ID:* ${refundsNoStripeId.length}`,
      );
      for (const r of refundsNoStripeId) {
        lines.push(
          `  - \`${r.id}\` order \`${r.orderId}\` ${r.type} ` +
          `£${(r.amountPence / 100).toFixed(2)} created ${r.createdAt.toISOString()}`,
        );
      }
      this.logger.error(
        `Reconciliation: ${refundsNoStripeId.length} refund payment(s) missing stripeRefundId - verify Stripe dashboard`,
        refundsNoStripeId.map((r) => ({ id: r.id, orderId: r.orderId, amountPence: r.amountPence })),
      );
    }

    lines.push(
      `\n_Do not auto-remediate. Review via <${process.env.ADMIN_URL ?? 'https://admin.feastpot.co.uk'}/payouts|admin payouts> and Stripe dashboard._`,
    );

    await this.sendSlack(lines.join('\n'));
  }

  /**
   * All Bull queues registered in this application, ordered by priority.
   * Used by both the monitoring crons (collectDepths/collectFailures) and
   * the admin dead-letter API so every queue is consistently covered.
   */
  private get allQueues(): Array<[string, Queue]> {
    return [
      [NOTIFICATIONS_QUEUE, this.notifications],
      [STRIPE_WEBHOOK_QUEUE, this.stripeWebhooks],
      [PAYOUTS_QUEUE, this.payouts],
      [COMPLIANCE_QUEUE, this.compliance],
      [TERMS_NOTICES_QUEUE, this.termsNotices],
      [HMRC_QUEUE, this.hmrc],
    ];
  }

  private async collectFailures(): Promise<QueueFailureSummary[]> {
    const queues = this.allQueues;

    const results: QueueFailureSummary[] = [];
    for (const [name, queue] of queues) {
      try {
        const failed = await queue.getFailedCount();
        let lastError: string | null = null;
        if (failed > 0) {
          const [lastFailed] = await queue.getFailed(0, 0);
          lastError = lastFailed?.failedReason ?? lastFailed?.stacktrace?.[0] ?? null;
        }
        results.push({ queue: name, failed, lastError });
      } catch (err) {
        this.logger.error(`Failed to inspect queue ${name}: ${(err as Error).message}`);
        results.push({ queue: name, failed: 0, lastError: null });
      }
    }
    return results;
  }

  private renderHtml(failing: QueueFailureSummary[]): string {
    const rows = failing
      .map(
        (s) => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;"><code>${s.queue}</code></td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;"><strong>${s.failed}</strong></td>
          <td style="padding:8px;border:1px solid #ddd;font-family:monospace;font-size:12px;">${
            s.lastError ? this.escape(s.lastError).slice(0, 500) : '<em>n/a</em>'
          }</td>
        </tr>`,
      )
      .join('');

    return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:20px;">
      <h2>Feastpot - BullMQ failed jobs</h2>
      <p>The daily DLQ scan found queues with failed jobs. Inspect and replay or discard via Bull Board:
        <a href="https://feastpot-platform.replit.app/admin/queues">Bull Board</a>
      </p>
      <table style="border-collapse:collapse;width:100%;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Queue</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:right;">Failed</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Most recent error</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px;">
        Sent automatically by DlqMonitorService at ${new Date().toISOString()}.
      </p>
    </body></html>`;
  }

  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- Dead-letter admin API ----------

  /**
   * Returns the most recently failed Bull jobs across all queues, with
   * sensitive payload fields redacted, sorted newest-first.
   */
  async getDeadLetterJobs(limit = 50): Promise<
    Array<{
      id: string;
      queue: string;
      name: string;
      payload: Record<string, unknown>;
      failedReason: string | null;
      attemptsMade: number;
      timestamp: number;
      processedOn: number | null;
      finishedOn: number | null;
    }>
  > {
    const results: Array<{
      id: string;
      queue: string;
      name: string;
      payload: Record<string, unknown>;
      failedReason: string | null;
      attemptsMade: number;
      timestamp: number;
      processedOn: number | null;
      finishedOn: number | null;
    }> = [];

    for (const [queueName, queue] of this.allQueues) {
      try {
        // getFailed(start, end) - end is inclusive, 0-indexed.
        const jobs = await queue.getFailed(0, limit - 1);
        for (const job of jobs) {
          results.push({
            id: String(job.id),
            queue: queueName,
            name: job.name,
            payload: redactPayload(job.data as unknown) as Record<string, unknown>,
            failedReason: job.failedReason ?? null,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
            processedOn: job.processedOn ?? null,
            finishedOn: job.finishedOn ?? null,
          });
        }
      } catch (err) {
        this.logger.error(
          `Failed to fetch dead-letter jobs from ${queueName}: ${(err as Error).message}`,
        );
      }
    }

    // Sort most-recently-failed first.
    results.sort(
      (a, b) => (b.finishedOn ?? b.timestamp) - (a.finishedOn ?? a.timestamp),
    );
    return results.slice(0, limit);
  }

  /**
   * Re-enqueues a specific failed job for immediate retry.
   * The acting admin ID is recorded in server logs for audit purposes.
   */
  async retryDeadLetterJob(
    queueName: string,
    jobId: string,
    actorId: string,
  ): Promise<void> {
    const queue = this.resolveQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in queue "${queueName}"`);
    }
    await job.retry();
    this.logger.log(
      `[Admin] Dead-letter job ${jobId} in "${queueName}" retried by ${actorId}`,
    );
  }

  /**
   * Permanently removes a specific failed job from the queue.
   * Cannot be undone. The acting admin ID is recorded for audit.
   */
  async discardDeadLetterJob(
    queueName: string,
    jobId: string,
    actorId: string,
  ): Promise<void> {
    const queue = this.resolveQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in queue "${queueName}"`);
    }
    await job.remove();
    this.logger.log(
      `[Admin] Dead-letter job ${jobId} in "${queueName}" discarded by ${actorId}`,
    );
  }

  private resolveQueue(name: string): Queue {
    const entry = this.allQueues.find(([n]) => n === name);
    if (!entry) {
      throw new BadRequestException({
        code: 'UNKNOWN_QUEUE',
        message: `Unknown queue: "${name}"`,
      });
    }
    return entry[1];
  }
}
