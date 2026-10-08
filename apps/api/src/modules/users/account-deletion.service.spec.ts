import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

import { AccountDeletionService } from './account-deletion.service';

const USER = '00000000-0000-4000-8000-000000000001';
const ADMIN = '00000000-0000-4000-8000-000000000002';
const REQUEST = '00000000-0000-4000-8000-000000000003';
const user = {
  id: USER,
  email: 'fixture@example.invalid',
  role: UserRole.customer,
  status: UserStatus.active,
  isTestData: true,
};

function setup() {
  const tx: any = {
    $executeRaw: jest.fn(),
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      findMany: jest.fn().mockResolvedValue([]),
    },
    accountDeletionRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({ isTestData: true }),
      create: jest.fn().mockImplementation(({ data }) => ({ id: REQUEST, ...data })),
      update: jest.fn(),
    },
    vendor: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
    inboxNotification: { create: jest.fn() },
  };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    vendor: { findUnique: jest.fn().mockResolvedValue(null) },
    payout: { findMany: jest.fn().mockResolvedValue([]) },
    payment: { count: jest.fn().mockResolvedValue(0) },
    feastPassSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
    accountDeletionRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
  };
  const notices: any = { createTransactionalOutbox: jest.fn().mockResolvedValue({ id: REQUEST }) };
  return { service: new AccountDeletionService(prisma, notices), prisma, tx, notices };
}

describe('Account deletion request safety', () => {
  it('uses exactly fourteen days and keeps the subject account active', async () => {
    const { service, tx, prisma } = setup();
    await service.request(USER, USER);
    const data = tx.accountDeletionRequest.create.mock.calls[0][0].data;
    expect(data.eligibleAt.getTime() - data.requestedAt.getTime()).toBe(14 * 86_400_000);
    expect(prisma.user.update).toBeUndefined();
    expect(tx.vendor.updateMany).toHaveBeenCalledWith({
      where: { userId: USER },
      data: { status: 'suspended' },
    });
  });

  it('persists the audit and notification intent in the request transaction', async () => {
    const { service, tx, notices } = setup();
    tx.user.findMany.mockResolvedValue([{ id: ADMIN, email: 'admin@example.invalid' }]);
    await service.request(USER, ADMIN, 'Deletion requested by email');
    expect(tx.auditLog.create.mock.calls[0][0].data.actorId).toBe(ADMIN);
    expect(notices.createTransactionalOutbox).not.toHaveBeenCalled();
    expect(tx.inboxNotification.create).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it('does not restart the grace period for a duplicate request', async () => {
    const { service, tx } = setup();
    tx.accountDeletionRequest.findFirst.mockResolvedValue({ id: REQUEST, status: 'requested' });
    await service.request(USER, USER);
    expect(tx.accountDeletionRequest.create).not.toHaveBeenCalled();
  });

  it('does not allow staff to self-delete through the customer/vendor flow', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ ...user, role: UserRole.admin });
    await expect(service.request(USER, USER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('identifies open orders instead of silently treating the account as clear', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{ reference: 'FP-FIXTURE-OPEN' }]);
    const blockers = await service.blockers(USER);
    expect(blockers[0]).toEqual({
      code: 'OPEN_ORDERS',
      count: 1,
      message: 'Orders requiring resolution: FP-FIXTURE-OPEN',
    });
  });

  it.each(['CANCELLED', 'EXPIRED'])('does not block a %s FeastPass', async (status) => {
    const { service, prisma } = setup();
    prisma.feastPassSubscription.findUnique.mockResolvedValue({ status });
    expect(await service.blockers(USER)).toEqual([]);
  });

  it('blocks active FeastPass subscriptions', async () => {
    const { service, prisma } = setup();
    prisma.feastPassSubscription.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    expect((await service.blockers(USER)).map((row) => row.code)).toContain('ACTIVE_FEASTPASS');
  });

  it('requires settlement review for historical vendor payments even with no pending payout row', async () => {
    const { service, prisma } = setup();
    prisma.vendor.findUnique.mockResolvedValue({ id: ADMIN });
    prisma.payment.count.mockResolvedValue(1);
    expect((await service.blockers(USER)).map((row) => row.code)).toContain(
      'FINAL_SETTLEMENT_REVIEW',
    );
  });

  it('cancels the request without blindly restoring a listing', async () => {
    const { service, tx } = setup();
    tx.accountDeletionRequest.findFirst.mockResolvedValue({
      id: REQUEST,
      status: 'requested',
      isTestData: true,
    });
    await service.cancel(USER, USER);
    expect(tx.accountDeletionRequest.update.mock.calls[0][0].data.status).toBe('cancelled');
    expect(tx.vendor.updateMany).not.toHaveBeenCalled();
  });

  it('refuses cancellation once erasure has started', async () => {
    const { service, tx } = setup();
    tx.accountDeletionRequest.findFirst.mockResolvedValue({ id: REQUEST, status: 'processing' });
    await expect(service.cancel(USER, USER)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.accountDeletionRequest.update).not.toHaveBeenCalled();
  });

  it('never presents expired grace as completed erasure', async () => {
    const { service, prisma } = setup();
    prisma.accountDeletionRequest.findFirst.mockResolvedValue({
      id: REQUEST,
      status: 'requested',
      eligibleAt: new Date(0),
    });
    expect((await service.status(USER)).blockers.map((row) => row.code)).toContain(
      'FINAL_ERASURE_UNVERIFIED',
    );
  });
});
