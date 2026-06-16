import * as Sentry from '@sentry/nestjs';
import type { Queue } from 'bull';

import type { RedisCacheService } from '../common/cache/redis-cache.service';

import { QueueDepthMonitorService } from './queue-depth-monitor.service';

jest.mock('@sentry/nestjs', () => ({ captureMessage: jest.fn() }));

const captureMessage = Sentry.captureMessage as jest.Mock;

// A controllable fake queue: tests mutate `waiting`/`failed` between checks.
function fakeQueue(): Queue & { waiting: number; failed: number } {
  const q = {
    waiting: 0,
    failed: 0,
    getWaitingCount: jest.fn(async () => q.waiting),
    getFailedCount: jest.fn(async () => q.failed),
  };
  return q as unknown as Queue & { waiting: number; failed: number };
}

describe('QueueDepthMonitorService', () => {
  const ENV_KEYS = [
    'QUEUE_ALERT_FAILED_THRESHOLD',
    'QUEUE_ALERT_WAITING_THRESHOLD',
    'QUEUE_ALERT_SUSTAINED_CHECKS',
    'QUEUE_ALERT_REPEAT_MINUTES',
  ] as const;
  const original: Record<string, string | undefined> = {};

  let notifications: ReturnType<typeof fakeQueue>;
  let stripeWebhooks: ReturnType<typeof fakeQueue>;
  let payouts: ReturnType<typeof fakeQueue>;
  let compliance: ReturnType<typeof fakeQueue>;
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

    notifications = fakeQueue();
    stripeWebhooks = fakeQueue();
    payouts = fakeQueue();
    compliance = fakeQueue();
    cache = { available: true } as unknown as RedisCacheService;

    service = new QueueDepthMonitorService(
      notifications,
      stripeWebhooks,
      payouts,
      compliance,
      cache,
    );
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it('does not alert while all queues are within thresholds', async () => {
    notifications.waiting = 10;
    compliance.failed = 24;
    await service.checkAndAlert();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('does not alert on a single transient burst (not yet sustained)', async () => {
    notifications.waiting = 500; // breaching but only once
    await service.checkAndAlert();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('alerts once a breach is sustained across sustainedChecks polls', async () => {
    compliance.failed = 30;
    await service.checkAndAlert(); // breach #1 — not yet sustained
    expect(captureMessage).not.toHaveBeenCalled();
    await service.checkAndAlert(); // breach #2 — sustained → page
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message, ctx] = captureMessage.mock.calls[0];
    expect(message).toContain('compliance');
    expect(ctx.tags.queue).toBe('compliance');
    expect(ctx.fingerprint).toEqual(['queue-depth-monitor', 'compliance']);
    expect(ctx.extra.failed).toBe(30);
  });

  it('does not re-page every check while still breached (repeat window)', async () => {
    payouts.failed = 40;
    await service.checkAndAlert();
    await service.checkAndAlert(); // first page
    await service.checkAndAlert(); // still breached, within repeat window
    await service.checkAndAlert();
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('re-pages a new episode after the queue recovers', async () => {
    compliance.failed = 30;
    await service.checkAndAlert();
    await service.checkAndAlert(); // page #1
    expect(captureMessage).toHaveBeenCalledTimes(1);

    compliance.failed = 0; // recovered → state resets
    await service.checkAndAlert();

    compliance.failed = 30; // new episode
    await service.checkAndAlert();
    await service.checkAndAlert(); // page #2
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  it('skips scanning when Redis is unavailable', async () => {
    (cache as { available: boolean }).available = false;
    payouts.failed = 999;
    await service.checkAndAlert();
    await service.checkAndAlert();
    expect(captureMessage).not.toHaveBeenCalled();
    expect(payouts.getFailedCount).not.toHaveBeenCalled();
  });

  it('alerts on waiting threshold breaches too', async () => {
    notifications.waiting = 150;
    await service.checkAndAlert();
    await service.checkAndAlert();
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message] = captureMessage.mock.calls[0];
    expect(message).toContain('waiting=150');
  });
});
