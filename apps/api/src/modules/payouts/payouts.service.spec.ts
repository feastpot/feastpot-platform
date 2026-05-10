import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayoutStatus, UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';

import {
  aggregateVendorBatch,
  lastCompletedWeekUtc,
  PayoutsService,
} from './payouts.service';

const finance: AuthUser = { id: 'finance-1', email: 'f@x.io', role: UserRole.finance, token: 't' } as AuthUser;
const support: AuthUser = { id: 'support-1', email: 's@x.io', role: UserRole.support, token: 't' } as AuthUser;
const adminUser: AuthUser = { id: 'admin-1', email: 'a@x.io', role: UserRole.admin, token: 't' } as AuthUser;

type Mock<T = unknown> = jest.Mock<T>;

function makePrisma() {
  return {
    vendor: { findUnique: jest.fn() as Mock },
    payout: {
      findMany: jest.fn() as Mock,
      findUnique: jest.fn() as Mock,
      findFirst: jest.fn() as Mock,
      updateMany: jest.fn() as Mock,
      update: jest.fn() as Mock,
      create: jest.fn() as Mock,
    },
    order: { findMany: jest.fn() as Mock },
    payment: { aggregate: jest.fn() as Mock },
    dispute: { count: jest.fn() as Mock },
  };
}
const makeStripe = () => ({ createTransfer: jest.fn() as Mock });
const makeQueue = () => ({ add: jest.fn().mockResolvedValue({ id: '1' }) as Mock });

describe('lastCompletedWeekUtc', () => {
  it('on a Tuesday, returns Mon→Mon a week prior', () => {
    // Tue 2025-11-04 12:00Z → window = Mon 2025-10-27 .. Mon 2025-11-03
    const { start, end } = lastCompletedWeekUtc(new Date('2025-11-04T12:00:00Z'));
    expect(start.toISOString()).toBe('2025-10-27T00:00:00.000Z');
    expect(end.toISOString()).toBe('2025-11-03T00:00:00.000Z');
  });
  it('on a Sunday, returns the just-completed Mon→Mon', () => {
    const { start, end } = lastCompletedWeekUtc(new Date('2025-11-09T05:00:00Z'));
    expect(start.toISOString()).toBe('2025-10-27T00:00:00.000Z');
    expect(end.toISOString()).toBe('2025-11-03T00:00:00.000Z');
  });
  it('on a Monday at 02:00 (cron tick), processes the just-ended Mon→Sun', () => {
    // The cron fires Mon 02:00 UTC; the "completed" window is the prior week
    // ending at today's 00:00 (i.e. last Mon → this Mon, exclusive).
    const { start, end } = lastCompletedWeekUtc(new Date('2025-11-03T02:00:00Z'));
    expect(start.toISOString()).toBe('2025-10-27T00:00:00.000Z');
    expect(end.toISOString()).toBe('2025-11-03T00:00:00.000Z');
  });
});

describe('aggregateVendorBatch', () => {
  const orders = [
    { id: 'o1', totalPence: 1000, vendorPayoutPence: 850, commissionPence: 150 },
    { id: 'o2', totalPence: 2000, vendorPayoutPence: 1700, commissionPence: 300 },
  ];

  it('sums and produces draft when no dispute', () => {
    const totals = aggregateVendorBatch({
      vendorId: 'v1', vendorUserId: 'u1', commissionBps: 1500, hasOpenDispute: false,
      orders, refundDeductionsPence: 100,
    });
    expect(totals).toMatchObject({
      vendorId: 'v1',
      grossPence: 3000,
      commissionPence: 450,
      refundsPence: 100,
      netPence: 2450,
      orderCount: 2,
      status: PayoutStatus.draft,
      holdReason: null,
    });
  });

  it('flags held when vendor has open dispute', () => {
    const totals = aggregateVendorBatch({
      vendorId: 'v1', vendorUserId: 'u1', commissionBps: 1500, hasOpenDispute: true,
      orders, refundDeductionsPence: 0,
    });
    expect(totals.status).toBe(PayoutStatus.held);
    expect(totals.holdReason).toMatch(/dispute/i);
  });

  it('clamps net at zero when refunds exceed gross-commission', () => {
    const totals = aggregateVendorBatch({
      vendorId: 'v1', vendorUserId: 'u1', commissionBps: 1500, hasOpenDispute: false,
      orders, refundDeductionsPence: 999_999,
    });
    expect(totals.netPence).toBe(0);
  });
});

describe('PayoutsService.approvePayout', () => {
  function build() {
    const prisma = makePrisma();
    const stripe = makeStripe();
    const queue = makeQueue();
    const svc = new PayoutsService(prisma as any, stripe as any, queue as any);
    return { svc, prisma, stripe, queue };
  }

  it('rejects non-finance/admin actors at the service layer (defence in depth)', async () => {
    const { svc } = build();
    await expect(svc.approvePayout('p1', support)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin actor in addition to finance', async () => {
    const { svc, prisma, stripe } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      id: 'p1', vendorId: 'v1', amountPence: 1000, status: PayoutStatus.draft,
      vendor: { stripeAccountId: 'acct', payoutsEnabled: true, userId: 'vu' },
    });
    prisma.payout.updateMany.mockResolvedValueOnce({ count: 1 });
    stripe.createTransfer.mockResolvedValueOnce({ id: 'tr_1' });
    prisma.payout.update.mockResolvedValueOnce({ id: 'p1', status: PayoutStatus.transferred });
    await svc.approvePayout('p1', adminUser);
    expect(prisma.payout.updateMany).toHaveBeenCalled();
  });

  it('throws if payout missing', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce(null);
    await expect(svc.approvePayout('p1', finance)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws if not draft', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      status: PayoutStatus.held, vendor: { stripeAccountId: 'acct', payoutsEnabled: true, userId: 'vu' },
      amountPence: 1000,
    });
    await expect(svc.approvePayout('p1', finance)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws if vendor payouts disabled', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      status: PayoutStatus.draft, vendor: { stripeAccountId: null, payoutsEnabled: false, userId: 'vu' },
      amountPence: 1000,
    });
    await expect(svc.approvePayout('p1', finance)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('CAS guard: refuses when status changed concurrently', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      status: PayoutStatus.draft, vendor: { stripeAccountId: 'acct', payoutsEnabled: true, userId: 'vu' },
      amountPence: 1000,
    });
    prisma.payout.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.approvePayout('p1', finance)).rejects.toThrow(/concurrently/i);
  });

  it('happy path: transfers, marks transferred, notifies vendor', async () => {
    const { svc, prisma, stripe, queue } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      id: 'p1', vendorId: 'v1', amountPence: 2450, status: PayoutStatus.draft,
      vendor: { stripeAccountId: 'acct_1', payoutsEnabled: true, userId: 'vu1' },
    });
    prisma.payout.updateMany.mockResolvedValueOnce({ count: 1 });
    stripe.createTransfer.mockResolvedValueOnce({ id: 'tr_1' });
    prisma.payout.update.mockResolvedValueOnce({ id: 'p1', status: PayoutStatus.transferred });

    const out = await svc.approvePayout('p1', finance);

    expect(stripe.createTransfer).toHaveBeenCalledWith({ amountPence: 2450, destinationAccountId: 'acct_1', payoutId: 'p1' });
    expect(prisma.payout.update.mock.calls[0][0].data).toMatchObject({
      status: PayoutStatus.transferred, stripeTransferId: 'tr_1',
    });
    expect(queue.add).toHaveBeenCalledWith('payout_transferred', expect.objectContaining({ payoutId: 'p1' }));
    expect(out).toBeDefined();
  });

  it('marks failed when stripe throws', async () => {
    const { svc, prisma, stripe } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      id: 'p1', vendorId: 'v1', amountPence: 1000, status: PayoutStatus.draft,
      vendor: { stripeAccountId: 'acct', payoutsEnabled: true, userId: 'vu' },
    });
    prisma.payout.updateMany.mockResolvedValueOnce({ count: 1 });
    stripe.createTransfer.mockRejectedValueOnce(new Error('bank down'));
    prisma.payout.update.mockResolvedValueOnce({});

    await expect(svc.approvePayout('p1', finance)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payout.update.mock.calls[0][0].data).toMatchObject({
      status: PayoutStatus.failed, failureReason: 'bank down',
    });
  });
});

describe('PayoutsService.holdPayout', () => {
  function build() {
    const prisma = makePrisma();
    const svc = new PayoutsService(prisma as any, makeStripe() as any, makeQueue() as any);
    return { svc, prisma };
  }

  it('rejects non-finance/admin actors at the service layer (defence in depth)', async () => {
    const { svc } = build();
    await expect(svc.holdPayout('p1', 'reason', support)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to hold a transferred payout', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      status: PayoutStatus.transferred, vendorId: 'v1', vendor: { userId: 'u' },
    });
    await expect(svc.holdPayout('p1', 'reason', finance)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('CAS guard rejects when status changed concurrently', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      status: PayoutStatus.draft, vendorId: 'v1', vendor: { userId: 'u' },
    });
    prisma.payout.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.holdPayout('p1', 'reason', finance)).rejects.toThrow(/concurrently/i);
  });

  it('happy path holds + notifies', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique
      .mockResolvedValueOnce({ status: PayoutStatus.draft, vendorId: 'v1', vendor: { userId: 'vu' } })
      .mockResolvedValueOnce({ id: 'p1', status: PayoutStatus.held });
    prisma.payout.updateMany.mockResolvedValueOnce({ count: 1 });
    const out = await svc.holdPayout('p1', 'too risky', finance);
    expect(out).toMatchObject({ status: PayoutStatus.held });
  });
});

describe('PayoutsService.list (vendor scoping)', () => {
  it('forbids customers', async () => {
    const prisma = makePrisma();
    const svc = new PayoutsService(prisma as any, makeStripe() as any, makeQueue() as any);
    await expect(
      svc.list({ id: 'c', role: UserRole.customer, email: 'x', token: 't' } as any, {} as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('vendor sees only their own (returns empty when no vendor row)', async () => {
    const prisma = makePrisma();
    prisma.vendor.findUnique.mockResolvedValueOnce(null);
    const svc = new PayoutsService(prisma as any, makeStripe() as any, makeQueue() as any);
    const out = await svc.list({ id: 'u', role: UserRole.vendor, email: 'x', token: 't' } as any, {} as any);
    expect(out).toEqual({ data: [], nextCursor: null });
  });
});
