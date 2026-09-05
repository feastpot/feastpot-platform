import * as Sentry from '@sentry/nestjs';

import { NotificationEvent } from './notification-events';
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
      delete: jest.fn().mockResolvedValue({ id: 'ob-1' }) as Mock,
    },
  };
}

describe('NotificationsService.enqueue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds to the queue on the happy path without touching the outbox', async () => {
    const queue = makeQueue();
    const prisma = makePrisma();
    const svc = new NotificationsService(queue as any, prisma as any);

    await svc.enqueue(NotificationEvent.refund_issued_customer, { orderId: 'o-1' });

    expect(queue.add).toHaveBeenCalledWith('refund_issued_customer', { orderId: 'o-1' }, undefined);
    expect(prisma.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown dynamic event before queue or outbox access', async () => {
    const queue = makeQueue();
    const prisma = makePrisma();
    const svc = new NotificationsService(queue as any, prisma as any);

    await expect(svc.enqueue('not_a_notification', {})).rejects.toThrow(
      'Unknown notification event "not_a_notification"',
    );
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it('persists an outbox row (and does not throw) when queue.add fails', async () => {
    const queue = makeQueue();
    queue.add.mockRejectedValueOnce(new Error('Connection is closed.'));
    const prisma = makePrisma();
    const svc = new NotificationsService(queue as any, prisma as any);

    await expect(
      svc.enqueue(NotificationEvent.refund_deducted_vendor, {
        orderId: 'o-1',
        deductionPence: 100,
      }),
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

    await svc.enqueue(
      NotificationEvent.review_request,
      { orderId: 'o-1' },
      { jobId: 'review_request:o-1' },
    );

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
      svc.enqueue(NotificationEvent.refund_issued_customer, { orderId: 'o-1' }),
    ).resolves.toBeUndefined();

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ area: 'notification-outbox' }),
      }),
    );
  });
});

describe('NotificationsService transactional outbox', () => {
  let queue: ReturnType<typeof makeQueue>;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    queue = makeQueue();
    prisma = makePrisma();
  });

  it('writes the notice through the supplied transaction client', async () => {
    const tx = {
      notificationOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
    };
    const svc = new NotificationsService(queue as any, prisma as any);

    await expect(
      svc.createTransactionalOutbox(
        tx as any,
        'enforcement_action',
        { actionId: 'action-1' },
        'enforcement_action:action-1',
      ),
    ).resolves.toEqual({ id: 'outbox-1' });

    expect(tx.notificationOutbox.create).toHaveBeenCalledWith({
      data: {
        eventName: 'enforcement_action',
        payload: { actionId: 'action-1' },
        jobId: 'enforcement_action:action-1',
      },
      select: { id: true },
    });
  });

  it('leaves the transactional row in place when immediate dispatch fails', async () => {
    queue.add.mockRejectedValueOnce(new Error('redis unavailable'));
    const svc = new NotificationsService(queue as any, prisma as any);

    await expect(
      svc.dispatchTransactionalOutbox(
        'outbox-1',
        'enforcement_action',
        { actionId: 'action-1' },
        'enforcement_action:action-1',
      ),
    ).resolves.toBeUndefined();

    expect(prisma.notificationOutbox.delete).not.toHaveBeenCalled();
    expect(prisma.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it('deletes the transactional row after the deduplicated queue job is accepted', async () => {
    const svc = new NotificationsService(queue as any, prisma as any);

    await svc.dispatchTransactionalOutbox(
      'outbox-1',
      'enforcement_action',
      { actionId: 'action-1' },
      'enforcement_action:action-1',
    );

    expect(queue.add).toHaveBeenCalledWith(
      'enforcement_action',
      { actionId: 'action-1' },
      { jobId: 'enforcement_action:action-1' },
    );
    expect(prisma.notificationOutbox.delete).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
    });
  });
});
