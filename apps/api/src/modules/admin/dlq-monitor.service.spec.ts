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
