import * as Sentry from '@sentry/nestjs';

import type { RedisCacheService } from '../common/cache/redis-cache.service';

import { QueueDepthMonitorService } from './queue-depth-monitor.service';
import type { QueueSnapshotService } from './queue-snapshot.service';

jest.mock('@sentry/nestjs', () => ({ captureMessage: jest.fn() }));

const captureMessage = Sentry.captureMessage as jest.Mock;

describe('QueueDepthMonitorService', () => {
  const ENV_KEYS = [
    'QUEUE_ALERT_FAILED_THRESHOLD',
    'QUEUE_ALERT_WAITING_THRESHOLD',
    'QUEUE_ALERT_SUSTAINED_CHECKS',
    'QUEUE_ALERT_REPEAT_MINUTES',
  ] as const;
  const original: Record<string, string | undefined> = {};

  let depths: Record<string, { waiting: number; failed: number }>;
  let snapshots: QueueSnapshotService;
  let cache: RedisCacheService;
  let service: QueueDepthMonitorService;

  beforeEach(() => {
    captureMessage.mockClear();
    for (const k of ENV_KEYS) original[k] = process.env[k];
    // Deterministic thresholds for the suite.
    process.env.QUEUE_ALERT_FAILED_THRESHOLD = '25';
    process.env.QUEUE_ALERT_WAITING_THRESHOLD = '100';
    process.env.QUEUE_ALERT_SUSTAINED_CHECKS = '2';
    process.env.QUEUE_ALERT_REPEAT_MINUTES = '60';

    depths = Object.fromEntries(
      [
        'notifications',
        'stripe-webhooks',
        'payouts',
        'compliance',
        'terms-notices',
        'hmrc',
        'attribution-qr',
      ].map((queue) => [queue, { waiting: 0, failed: 0 }]),
    );
    snapshots = {
      snapshots: jest.fn(async () =>
        Object.entries(depths).map(([queue, depth]) => ({
          queue,
          available: true,
          ...depth,
          active: 0,
          delayed: 0,
          oldestWaitingAgeMs: null,
        })),
      ),
    } as unknown as QueueSnapshotService;
    cache = { available: true } as unknown as RedisCacheService;

    service = new QueueDepthMonitorService(snapshots, cache);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it('does not alert while all queues are within thresholds', async () => {
    depths.notifications.waiting = 10;
    depths.compliance.failed = 24;
    await service.checkAndAlert();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('does not alert on a single transient burst (not yet sustained)', async () => {
    depths.notifications.waiting = 500; // breaching but only once
    await service.checkAndAlert();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('alerts once a breach is sustained across sustainedChecks polls', async () => {
    depths.compliance.failed = 30;
    await service.checkAndAlert(); // breach #1 - not yet sustained
    expect(captureMessage).not.toHaveBeenCalled();
    await service.checkAndAlert(); // breach #2 - sustained → page
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message, ctx] = captureMessage.mock.calls[0];
    expect(message).toContain('compliance');
    expect(ctx.tags.queue).toBe('compliance');
    expect(ctx.fingerprint).toEqual(['queue-depth-monitor', 'compliance']);
    expect(ctx.extra.failed).toBe(30);
  });

  it('does not re-page every check while still breached (repeat window)', async () => {
    depths.payouts.failed = 40;
    await service.checkAndAlert();
    await service.checkAndAlert(); // first page
    await service.checkAndAlert(); // still breached, within repeat window
    await service.checkAndAlert();
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('re-pages a new episode after the queue recovers', async () => {
    depths.compliance.failed = 30;
    await service.checkAndAlert();
    await service.checkAndAlert(); // page #1
    expect(captureMessage).toHaveBeenCalledTimes(1);

    depths.compliance.failed = 0; // recovered → state resets
    await service.checkAndAlert();

    depths.compliance.failed = 30; // new episode
    await service.checkAndAlert();
    await service.checkAndAlert(); // page #2
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  it('skips scanning when Redis is unavailable', async () => {
    (cache as { available: boolean }).available = false;
    depths.payouts.failed = 999;
    await service.checkAndAlert();
    await service.checkAndAlert();
    expect(captureMessage).not.toHaveBeenCalled();
    expect(snapshots.snapshots).not.toHaveBeenCalled();
  });

  it('alerts on waiting threshold breaches too', async () => {
    depths.notifications.waiting = 150;
    await service.checkAndAlert();
    await service.checkAndAlert();
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message] = captureMessage.mock.calls[0];
    expect(message).toContain('waiting=150');
  });

  it('alerts when queue telemetry remains unavailable', async () => {
    (snapshots.snapshots as jest.Mock).mockResolvedValue([
      {
        queue: 'payouts',
        available: false,
        error: 'Redis connection failed',
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
        oldestWaitingAgeMs: null,
      },
    ]);

    await service.checkAndAlert();
    await service.checkAndAlert();

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toContain('telemetry unavailable');
  });
});
