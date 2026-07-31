import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Queue } from 'bull';
import { Resend } from 'resend';

import { RedisCacheService } from '../../common/cache/redis-cache.service';
import {
  COMPLIANCE_QUEUE,
  NOTIFICATIONS_QUEUE,
  PAYOUTS_QUEUE,
  STRIPE_WEBHOOK_QUEUE,
} from '../../queues/queues.module';

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

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
    @InjectQueue(STRIPE_WEBHOOK_QUEUE) private readonly stripeWebhooks: Queue,
    @InjectQueue(PAYOUTS_QUEUE) private readonly payouts: Queue,
    @InjectQueue(COMPLIANCE_QUEUE) private readonly compliance: Queue,
    config: ConfigService,
    private readonly cache: RedisCacheService,
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
   * Two conditions per queue:
   *  - failed jobs >= QUEUE_ALERT_FAILED_THRESHOLD (default 1)
   *  - waiting jobs >= QUEUE_ALERT_WAITING_THRESHOLD (default 100)
   *
   * Deduped per queue+condition via a 60-min Redis key so a sustained backlog
   * produces one alert per hour, not one every 5 minutes. Complements (does
   * not replace) the 09:00 daily email digest below.
   */
  @Cron('*/5 * * * *')
  async checkQueueDepths(): Promise<void> {
    if (!this.cache.available) return;

    const snapshots = await this.collectDepths();
    const breaches: string[] = [];

    for (const snap of snapshots) {
      if (snap.failed >= this.failedThreshold) {
        if (await this.shouldAlert(`${snap.queue}:failed`)) {
          breaches.push(`\`${snap.queue}\`: *${snap.failed} failed* job(s)`);
        }
      }
      if (snap.waiting >= this.waitingThreshold) {
        if (await this.shouldAlert(`${snap.queue}:waiting`)) {
          breaches.push(`\`${snap.queue}\`: *${snap.waiting} waiting* (backlog)`);
        }
      }
    }

    if (breaches.length === 0) return;

    const text =
      `:rotating_light: *Feastpot queue alert*\n${breaches.join('\n')}\n` +
      `Inspect via Bull Board: https://api.feastpot.co.uk/admin/queues`;
    await this.sendSlack(text);
  }

  /** True once per key per hour (Redis-deduped). Fails open to alerting. */
  private async shouldAlert(key: string): Promise<boolean> {
    const cacheKey = `queue-alert:${key}`;
    try {
      if (await this.cache.get(cacheKey)) return false;
      await this.cache.set(cacheKey, 1, 60 * 60);
      return true;
    } catch {
      return true;
    }
  }

  private async sendSlack(text: string): Promise<void> {
    if (!this.slackWebhookUrl) {
      this.logger.warn(`Queue alert (no QUEUE_ALERT_SLACK_WEBHOOK_URL set): ${text}`);
      return;
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
      } else {
        this.logger.log('Slack queue alert sent.');
      }
    } catch (err) {
      this.logger.error(`Slack queue alert failed: ${(err as Error).message}`);
    }
  }

  private async collectDepths(): Promise<QueueDepthSnapshot[]> {
    const queues: Array<[string, Queue]> = [
      [NOTIFICATIONS_QUEUE, this.notifications],
      [STRIPE_WEBHOOK_QUEUE, this.stripeWebhooks],
      [PAYOUTS_QUEUE, this.payouts],
      [COMPLIANCE_QUEUE, this.compliance],
    ];
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

  private async collectFailures(): Promise<QueueFailureSummary[]> {
    const queues: Array<[string, Queue]> = [
      [NOTIFICATIONS_QUEUE, this.notifications],
      [STRIPE_WEBHOOK_QUEUE, this.stripeWebhooks],
      [PAYOUTS_QUEUE, this.payouts],
      [COMPLIANCE_QUEUE, this.compliance],
    ];

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
}
