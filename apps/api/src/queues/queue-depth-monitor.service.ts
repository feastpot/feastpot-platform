import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';
import type { Queue } from 'bull';

import { RedisCacheService } from '../common/cache/redis-cache.service';

import {
  COMPLIANCE_QUEUE,
  NOTIFICATIONS_QUEUE,
  PAYOUTS_QUEUE,
  STRIPE_WEBHOOK_QUEUE,
} from './queues.module';

interface MonitorThresholds {
  failed: number;
  waiting: number;
  sustainedChecks: number;
  repeatMs: number;
}

interface QueueBreachState {
  // Number of consecutive checks (incl. the current one) in which this queue
  // has breached a threshold. Used to require a *sustained* backup before
  // paging, so a normal cron burst that drains within a check or two never
  // alerts.
  consecutiveBreaches: number;
  // Epoch ms of the last Sentry alert raised for the current episode. null
  // once the queue recovers, so the next episode pages immediately.
  lastAlertAt: number | null;
}

interface QueueSnapshot {
  queue: string;
  waiting: number;
  failed: number;
  breached: boolean;
  reasons: string[];
}

// Read a positive-integer env var, falling back to `fallback` when unset,
// empty, non-numeric, or <= 0. Mirrors the direct-process.env style used by
// required-env / service-fee / the health controller (no ConfigService).
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * Proactive queue-depth alarm.
 *
 * The production symptom behind this monitor: a Bull queue's `failed` (and/or
 * `waiting`) count crept up unnoticed because queue depth is only *reported*
 * in `/health/z` and never *paged on* (by design it doesn't affect the
 * 200/503 verdict). This service polls the same depths the health probe
 * collects and raises a Sentry alert when any queue stays backed up.
 *
 * Distinct from `DlqMonitorService` (admin module): that runs once daily and
 * emails a digest of *failed* jobs. This runs every 5 minutes, watches both
 * `waiting` and `failed`, and escalates to Sentry — the on-call paging path —
 * so a recurrence is caught within minutes rather than at the next daily scan.
 *
 * False-alarm guard: an alert only fires once a queue has breached for
 * `sustainedChecks` consecutive polls. Cron jobs enqueue bursts that briefly
 * spike `waiting`; requiring the breach to persist across polls means a burst
 * the workers drain in time never pages. While a queue stays breached we
 * re-alert at most once per `repeatMs` so a long-running incident is not
 * forgotten without spamming on-call every 5 minutes. State resets the moment
 * the queue drops back below threshold.
 */
@Injectable()
export class QueueDepthMonitorService {
  private readonly logger = new Logger(QueueDepthMonitorService.name);
  private readonly state = new Map<string, QueueBreachState>();

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
    @InjectQueue(STRIPE_WEBHOOK_QUEUE) private readonly stripeWebhooks: Queue,
    @InjectQueue(PAYOUTS_QUEUE) private readonly payouts: Queue,
    @InjectQueue(COMPLIANCE_QUEUE) private readonly compliance: Queue,
    private readonly cache: RedisCacheService,
  ) {}

  private thresholds(): MonitorThresholds {
    return {
      failed: intEnv('QUEUE_ALERT_FAILED_THRESHOLD', 25),
      waiting: intEnv('QUEUE_ALERT_WAITING_THRESHOLD', 100),
      sustainedChecks: intEnv('QUEUE_ALERT_SUSTAINED_CHECKS', 2),
      repeatMs: intEnv('QUEUE_ALERT_REPEAT_MINUTES', 60) * 60_000,
    };
  }

  /** Every 5 minutes, aligned with the queues' 5-minute poll cadence. */
  @Cron('*/5 * * * *', { name: 'queue-depth-monitor' })
  async checkAndAlert(): Promise<void> {
    // No point inspecting queues when Redis is permanently unreachable — the
    // depth reads would just throw. The Redis outage itself surfaces via
    // /health/z (degraded) and the processors' own error paths.
    if (!this.cache.available) {
      this.logger.warn('Redis unavailable - skipping queue-depth scan');
      return;
    }

    const thresholds = this.thresholds();
    const snapshots = await this.collectSnapshots(thresholds);
    const now = Date.now();

    for (const snap of snapshots) {
      const prev = this.state.get(snap.queue) ?? { consecutiveBreaches: 0, lastAlertAt: null };

      if (!snap.breached) {
        // Recovered (or never breached): clear the episode so the next breach
        // pages immediately rather than waiting out a stale repeat window.
        if (prev.consecutiveBreaches > 0 || prev.lastAlertAt !== null) {
          this.logger.log(
            `[${snap.queue}] back within thresholds (waiting=${snap.waiting}, failed=${snap.failed})`,
          );
        }
        this.state.set(snap.queue, { consecutiveBreaches: 0, lastAlertAt: null });
        continue;
      }

      const consecutiveBreaches = prev.consecutiveBreaches + 1;
      let { lastAlertAt } = prev;

      const sustained = consecutiveBreaches >= thresholds.sustainedChecks;
      const repeatDue = lastAlertAt !== null && now - lastAlertAt >= thresholds.repeatMs;
      const firstAlertThisEpisode = lastAlertAt === null;

      if (sustained && (firstAlertThisEpisode || repeatDue)) {
        this.raiseAlert(snap, thresholds, consecutiveBreaches);
        lastAlertAt = now;
      } else {
        this.logger.warn(
          `[${snap.queue}] breaching (${snap.reasons.join(', ')}) ` +
            `consecutive=${consecutiveBreaches}/${thresholds.sustainedChecks}` +
            (sustained ? ' (alert suppressed until repeat window)' : ' (not yet sustained)'),
        );
      }

      this.state.set(snap.queue, { consecutiveBreaches, lastAlertAt });
    }
  }

  private async collectSnapshots(thresholds: MonitorThresholds): Promise<QueueSnapshot[]> {
    const queues: Array<[string, Queue]> = [
      [NOTIFICATIONS_QUEUE, this.notifications],
      [STRIPE_WEBHOOK_QUEUE, this.stripeWebhooks],
      [PAYOUTS_QUEUE, this.payouts],
      [COMPLIANCE_QUEUE, this.compliance],
    ];

    const snapshots = await Promise.all(
      queues.map(async ([name, q]): Promise<QueueSnapshot | null> => {
        try {
          const [waiting, failed] = await Promise.all([q.getWaitingCount(), q.getFailedCount()]);
          const reasons: string[] = [];
          if (failed >= thresholds.failed) {
            reasons.push(`failed=${failed} >= ${thresholds.failed}`);
          }
          if (waiting >= thresholds.waiting) {
            reasons.push(`waiting=${waiting} >= ${thresholds.waiting}`);
          }
          return { queue: name, waiting, failed, breached: reasons.length > 0, reasons };
        } catch (err) {
          // A single queue read failing shouldn't blind the others. Log and
          // skip — the broader Redis outage path handles total unavailability.
          this.logger.error(`Failed to inspect queue ${name}: ${(err as Error).message}`);
          return null;
        }
      }),
    );

    return snapshots.filter((s): s is QueueSnapshot => s !== null);
  }

  private raiseAlert(
    snap: QueueSnapshot,
    thresholds: MonitorThresholds,
    consecutiveBreaches: number,
  ): void {
    const summary = snap.reasons.join('; ');
    const message = `Queue "${snap.queue}" backed up: ${summary}`;

    Sentry.captureMessage(message, {
      level: 'error',
      tags: { queue: snap.queue, alert: 'queue-depth' },
      // Group per queue so distinct queues don't collapse into one Sentry
      // issue, but repeated alerts for the same queue do.
      fingerprint: ['queue-depth-monitor', snap.queue],
      extra: {
        waiting: snap.waiting,
        failed: snap.failed,
        waitingThreshold: thresholds.waiting,
        failedThreshold: thresholds.failed,
        consecutiveBreaches,
        sustainedChecks: thresholds.sustainedChecks,
      },
    });

    this.logger.error(`PAGING: ${message} (sustained ${consecutiveBreaches} checks)`);
  }
}
