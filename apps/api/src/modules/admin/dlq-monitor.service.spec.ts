import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bull';

import type { RedisCacheService } from '../../common/cache/redis-cache.service';
import type { PrismaService } from '../../prisma/prisma.service';

import { DlqMonitorService } from './dlq-monitor.service';

describe('DlqMonitorService queue mutation audit', () => {
  const actorId = '00000000-0000-4000-8000-000000000001';
  let job: { name: string; retry: jest.Mock; remove: jest.Mock; getState: jest.Mock };
  let queue: Queue;
  let prisma: PrismaService;
  let service: DlqMonitorService;

  beforeEach(() => {
    job = {
      name: 'send-message',
      retry: jest.fn(),
      remove: jest.fn(),
      getState: jest.fn().mockResolvedValue('failed'),
    };
    queue = { getJob: jest.fn().mockResolvedValue(job) } as unknown as Queue;
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const config = { get: jest.fn() } as unknown as ConfigService;
    const cache = { available: true } as unknown as RedisCacheService;
    service = new DlqMonitorService(
      queue,
      queue,
      queue,
      queue,
      queue,
      queue,
      queue,
      config,
      cache,
      prisma,
    );
  });

  it('persists retry intent before mutating Redis and marks completion', async () => {
    await service.retryDeadLetterJob('notifications', 'job-1', actorId);

    // Bull's retry moves a failed job back to the waiting queue; do not
    // substitute a second job creation here, which would lose its payload,
    // attempts and idempotency key.
    expect(job.getState).toHaveBeenCalledTimes(1);
    expect(job.retry).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId,
        action: 'admin.queue_job_retry_requested',
        metadata: expect.objectContaining({ jobId: 'job-1', status: 'requested' }),
      }),
    });
    expect((prisma.auditLog.create as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      job.retry.mock.invocationCallOrder[0],
    );
    expect(prisma.auditLog.update).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      data: {
        action: 'admin.queue_job_retried',
        metadata: expect.objectContaining({ status: 'completed' }),
      },
    });
  });

  it('discards a failed job and records the acting admin in its durable audit row', async () => {
    await service.discardDeadLetterJob('notifications', 'job-discarded', actorId);

    expect(job.remove).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId,
        action: 'admin.queue_job_discard_requested',
        metadata: expect.objectContaining({
          jobId: 'job-discarded',
          status: 'requested',
        }),
      }),
    });
    expect(prisma.auditLog.update).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      data: {
        action: 'admin.queue_job_discarded',
        metadata: expect.objectContaining({ status: 'completed' }),
      },
    });
  });

  it('keeps a persisted discard intent and marks a failed mutation', async () => {
    job.remove.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.discardDeadLetterJob('notifications', 'job-2', actorId)).rejects.toThrow(
      'Redis unavailable',
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId,
        action: 'admin.queue_job_discard_requested',
        metadata: expect.objectContaining({ jobId: 'job-2', status: 'requested' }),
      }),
    });
    expect(prisma.auditLog.update).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      data: {
        action: 'admin.queue_job_discard_failed',
        metadata: expect.objectContaining({
          status: 'failed',
          error: 'Redis unavailable',
        }),
      },
    });
  });

  it('does not report a successful Redis mutation as failed when completion auditing is unavailable', async () => {
    (prisma.auditLog.update as jest.Mock).mockRejectedValue(new Error('Database unavailable'));

    await expect(
      service.retryDeadLetterJob('notifications', 'job-3', actorId),
    ).resolves.toBeUndefined();

    expect(job.retry).toHaveBeenCalledTimes(1);
  });

  it('does not mutate a job that is no longer failed', async () => {
    job.getState.mockResolvedValue('active');

    await expect(service.discardDeadLetterJob('notifications', 'job-4', actorId)).rejects.toThrow(
      'not in the failed state',
    );

    expect(job.remove).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('processes only explicitly supplied bulk jobs and retains individual audit records', async () => {
    const result = await service.bulkDeadLetterJobs(
      'retry',
      [{ queue: 'notifications', jobId: 'job-5' }],
      actorId,
    );

    expect(result).toEqual({ succeeded: ['job-5'], failed: [] });
    expect(job.retry).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorId }) }),
    );
  });
});

describe('DlqMonitorService operational alert delivery', () => {
  const start = 1_800_000_000_000;
  let depths: { waiting: number; active: number; failed: number; isPaused: boolean };
  let cacheValues: Map<string, unknown>;
  let cache: RedisCacheService;
  let service: DlqMonitorService;
  let fetchMock: jest.SpyInstance;

  function createService(webhookConfigured = true, prefix = 'bull') {
    const queue = (notification: boolean) =>
      ({
        getWaitingCount: jest.fn(async () => (notification ? depths.waiting : 0)),
        getActiveCount: jest.fn(async () => (notification ? depths.active : 0)),
        getFailedCount: jest.fn(async () => (notification ? depths.failed : 0)),
        isPaused: jest.fn(async () => notification && depths.isPaused),
        toKey: jest.fn(() => `${prefix}:notifications:`),
      }) as unknown as Queue;
    const config = {
      get: jest.fn((key: string) =>
        key === 'QUEUE_ALERT_SLACK_WEBHOOK_URL' && webhookConfigured
          ? 'https://slack.example.invalid/isolated-test'
          : undefined,
      ),
    } as unknown as ConfigService;
    return new DlqMonitorService(
      queue(true),
      queue(false),
      queue(false),
      queue(false),
      queue(false),
      queue(false),
      queue(false),
      config,
      cache,
      {} as PrismaService,
    );
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(start);
    depths = { waiting: 1, active: 0, failed: 0, isPaused: true };
    cacheValues = new Map();
    cache = {
      available: true,
      get: jest.fn(async (key: string) => cacheValues.get(key) ?? null),
      set: jest.fn(async (key: string, value: unknown) => cacheValues.set(key, value)),
      setIfAbsent: jest.fn(async (key: string, value: unknown) => {
        if (cacheValues.has(key)) return false;
        cacheValues.set(key, value);
        return true;
      }),
      del: jest.fn(async (key: string) => cacheValues.delete(key)),
    } as unknown as RedisCacheService;
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    service = createService();
  });

  afterEach(() => {
    fetchMock.mockRestore();
    jest.useRealTimers();
  });

  it('sends the no-consumer alert after ten minutes, with pause evidence', async () => {
    await service.checkQueueDepths();
    jest.setSystemTime(start + 5 * 60_000);
    await service.checkQueueDepths();
    expect(fetchMock).not.toHaveBeenCalled();
    jest.setSystemTime(start + 10 * 60_000);
    await service.checkQueueDepths();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toContain('no consumer for 10 minutes');
    expect(fetchMock.mock.calls[0][1].body).toContain('paused=true');
  });

  it('sends immediately above 50 waiting jobs', async () => {
    depths.waiting = 50;
    await service.checkQueueDepths();
    expect(fetchMock).not.toHaveBeenCalled();
    depths.waiting = 51;
    jest.setSystemTime(start + 5 * 60_000);
    await service.checkQueueDepths();
    expect(fetchMock.mock.calls[0][1].body).toContain('51 waiting');
  });

  it('sends when failures rise within fifteen minutes', async () => {
    depths.waiting = 0;
    depths.failed = 2;
    await service.checkQueueDepths();
    depths.failed = 3;
    jest.setSystemTime(start + 5 * 60_000);
    await service.checkQueueDepths();
    expect(fetchMock.mock.calls[0][1].body).toContain('15-minute baseline 2');
  });

  it('does not claim a missing webhook delivered a test alert', async () => {
    service = createService(false);
    expect(await service.triggerTestAlert()).toEqual({
      webhookConfigured: false,
      delivered: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('isolates sandbox alert history and leases from operational queues', async () => {
    service = createService(true, 'bull:test:isolated-run');
    await service.checkQueueDepths();
    expect(cacheValues.has('queue-alert:health:notifications')).toBe(false);
    expect(cacheValues.has('queue-alert:health:notifications:bull:test:isolated-run')).toBe(true);
  });

  it('releases reminder leases when the webhook fails so the next poll can retry', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
    await service.checkQueueDepths();
    jest.setSystemTime(start + 5 * 60_000);
    await service.checkQueueDepths();
    jest.setSystemTime(start + 10 * 60_000);
    await service.checkQueueDepths();
    expect(cacheValues.has('queue-alert:lease:notifications:no-consumer')).toBe(false);
    fetchMock.mockResolvedValue({ ok: true } as Response);
    jest.setSystemTime(start + 15 * 60_000);
    await service.checkQueueDepths();
    expect(fetchMock.mock.calls.at(-1)?.[1].body).toContain('no consumer for 10 minutes');
  });
});
