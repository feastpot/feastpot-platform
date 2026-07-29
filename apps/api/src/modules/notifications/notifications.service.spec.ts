import * as Sentry from '@sentry/nestjs';

import { NotificationsService } from './notifications.service';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

type Mock = jest.Mock;

function makeQueue() {
  return { add: jest.fn().mockResolvedValue({ id: '1' }) as Mock };
}
function makePrisma() {
  return {
    notificationOutbox: {
      create: jest.fn().mockResolvedValue({ id: 'ob-1' }) as Mock,
    },
  };
}

describe('NotificationsService.enqueue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds to the queue on the happy path without touching the outbox', async () => {
    const queue = makeQueue();
    const prisma = makePrisma();
    const svc = new NotificationsService(queue as any, prisma as any);

    await svc.enqueue('refund_issued_customer', { orderId: 'o-1' });

    expect(queue.add).toHaveBeenCalledWith('refund_issued_customer', { orderId: 'o-1' }, undefined);
    expect(prisma.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it('persists an outbox row (and does not throw) when queue.add fails', async () => {
    const queue = makeQueue();
    queue.add.mockRejectedValueOnce(new Error('Connection is closed.'));
    const prisma = makePrisma();
    const svc = new NotificationsService(queue as any, prisma as any);

    await expect(
      svc.enqueue('refund_deducted_vendor', { orderId: 'o-1', deductionPence: 100 }),
    ).resolves.toBeUndefined();

    expect(prisma.notificationOutbox.create).toHaveBeenCalledWith({
      data: {
        eventName: 'refund_deducted_vendor',
        payload: { orderId: 'o-1', deductionPence: 100 },
        jobId: null,
        lastError: 'Connection is closed.',
      },
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('preserves the dedupe jobId in the outbox row', async () => {
    const queue = makeQueue();
    queue.add.mockRejectedValueOnce(new Error('down'));
    const prisma = makePrisma();
    const svc = new NotificationsService(queue as any, prisma as any);

    await svc.enqueue('review_request', { orderId: 'o-1' }, { jobId: 'review_request:o-1' });

    expect(prisma.notificationOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ jobId: 'review_request:o-1' }) }),
    );
  });

  it('raises a Sentry alert (and does not throw) when queue AND outbox both fail', async () => {
    const queue = makeQueue();
    queue.add.mockRejectedValueOnce(new Error('redis down'));
    const prisma = makePrisma();
    prisma.notificationOutbox.create.mockRejectedValueOnce(new Error('db down'));
    const svc = new NotificationsService(queue as any, prisma as any);

    await expect(
      svc.enqueue('refund_issued_customer', { orderId: 'o-1' }),
    ).resolves.toBeUndefined();

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ area: 'notification-outbox' }),
      }),
    );
  });
});
