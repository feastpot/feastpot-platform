import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationsService } from './notifications.service';
import { NotificationEvent } from './notification-events';

type Mock = jest.Mock;

function makePrisma() {
  return {
    notificationOutbox: {
      create: jest.fn().mockResolvedValue({ id: 'ob-1' }) as Mock,
      findMany: jest.fn().mockResolvedValue([]) as Mock,
      delete: jest.fn().mockResolvedValue({}) as Mock,
      update: jest.fn().mockResolvedValue({}) as Mock,
    },
  };
}

describe('NotificationsService durable enqueue', () => {
  it('adds straight to the queue when Redis is up', async () => {
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const prisma = makePrisma();
    const svc = new NotificationsService(queue as any, prisma as any);

    await svc.enqueue(NotificationEvent.order_confirmation, { orderId: 'o-1' });

    expect(queue.add).toHaveBeenCalledWith(
      NotificationEvent.order_confirmation,
      { orderId: 'o-1' },
      undefined,
    );
    expect(prisma.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it('persists to the outbox when the queue add fails', async () => {
    const queue = { add: jest.fn().mockRejectedValue(new Error('Connection is closed.')) };
    const prisma = makePrisma();
    const svc = new NotificationsService(queue as any, prisma as any);

    await expect(
      svc.enqueue(NotificationEvent.refund_issued_customer, { orderId: 'o-1' }),
    ).resolves.not.toThrow();

    expect(prisma.notificationOutbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventName: NotificationEvent.refund_issued_customer,
        payload: { orderId: 'o-1' },
        lastError: 'Connection is closed.',
      }),
    });
  });

  it('never throws even when queue AND outbox both fail', async () => {
    const queue = { add: jest.fn().mockRejectedValue(new Error('redis down')) };
    const prisma = makePrisma();
    prisma.notificationOutbox.create.mockRejectedValue(new Error('db down'));
    const svc = new NotificationsService(queue as any, prisma as any);

    await expect(
      svc.enqueue(NotificationEvent.refund_issued_customer, { orderId: 'o-1' }),
    ).resolves.not.toThrow();
  });
});

describe('NotificationOutboxService.drain', () => {
  const row = {
    id: 'ob-1',
    eventName: NotificationEvent.refund_issued_customer,
    payload: { orderId: 'o-1' },
    jobId: null,
    attempts: 0,
  };

  it('re-enqueues due rows and deletes them on success', async () => {
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const prisma = makePrisma();
    prisma.notificationOutbox.findMany.mockResolvedValue([row]);
    const svc = new NotificationOutboxService(queue as any, prisma as any);

    await svc.drain();

    // Deterministic fallback jobId so a delete failure + re-drain is deduped.
    expect(queue.add).toHaveBeenCalledWith(
      'refund_issued_customer',
      { orderId: 'o-1' },
      { jobId: 'outbox:ob-1' },
    );
    expect(prisma.notificationOutbox.delete).toHaveBeenCalledWith({ where: { id: 'ob-1' } });
  });

  it('does NOT count a post-enqueue delete failure as an enqueue failure', async () => {
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const prisma = makePrisma();
    prisma.notificationOutbox.findMany.mockResolvedValue([row]);
    prisma.notificationOutbox.delete.mockRejectedValue(new Error('db blip'));
    const svc = new NotificationOutboxService(queue as any, prisma as any);

    await expect(svc.drain()).resolves.not.toThrow();

    // No attempts++/backoff: the enqueue succeeded, only cleanup failed. The
    // row survives and the next drain's re-add is absorbed by jobId dedupe.
    expect(prisma.notificationOutbox.update).not.toHaveBeenCalled();
  });

  it('backs off with attempts++ when the enqueue still fails', async () => {
    const queue = { add: jest.fn().mockRejectedValue(new Error('still down')) };
    const prisma = makePrisma();
    prisma.notificationOutbox.findMany.mockResolvedValue([row]);
    const svc = new NotificationOutboxService(queue as any, prisma as any);

    await svc.drain();

    expect(prisma.notificationOutbox.delete).not.toHaveBeenCalled();
    expect(prisma.notificationOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ob-1' },
        data: expect.objectContaining({ attempts: 1, lastError: 'still down' }),
      }),
    );
  });

  it('passes the deterministic jobId through so dedupe still works', async () => {
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const prisma = makePrisma();
    prisma.notificationOutbox.findMany.mockResolvedValue([{ ...row, jobId: 'review_request:o-1' }]);
    const svc = new NotificationOutboxService(queue as any, prisma as any);

    await svc.drain();

    expect(queue.add).toHaveBeenCalledWith(
      'refund_issued_customer',
      { orderId: 'o-1' },
      { jobId: 'review_request:o-1' },
    );
  });
});
