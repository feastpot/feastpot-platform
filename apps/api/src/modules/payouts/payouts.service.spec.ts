import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayoutStatus, UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';

import { aggregateVendorBatch, lastCompletedWeekUtc, PayoutsService } from './payouts.service';

const finance: AuthUser = {
  id: 'finance-1',
  email: 'f@x.io',
  role: UserRole.finance,
  token: 't',
} as AuthUser;
const support: AuthUser = {
  id: 'support-1',
  email: 's@x.io',
  role: UserRole.support,
  token: 't',
} as AuthUser;
const adminUser: AuthUser = {
  id: 'admin-1',
  email: 'a@x.io',
  role: UserRole.admin,
  token: 't',
} as AuthUser;

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
      vendorId: 'v1',
      vendorUserId: 'u1',
      commissionBps: 1500,
      hasOpenDispute: false,
      orders,
      refundDeductionsPence: 100,
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
      vendorId: 'v1',
      vendorUserId: 'u1',
      commissionBps: 1500,
      hasOpenDispute: true,
      orders,
      refundDeductionsPence: 0,
    });
    expect(totals.status).toBe(PayoutStatus.held);
    expect(totals.holdReason).toMatch(/dispute/i);
  });

  it('clamps net at zero when refunds exceed gross-commission', () => {
    const totals = aggregateVendorBatch({
      vendorId: 'v1',
      vendorUserId: 'u1',
      commissionBps: 1500,
      hasOpenDispute: false,
      orders,
      refundDeductionsPence: 999_999,
    });
    expect(totals.netPence).toBe(0);
  });

  it('nets from stored vendorPayoutPence so the service fee is NEVER paid out (revenue-leak guard)', () => {
    // £40 food + £2.49 delivery + £2.00 service fee = £44.49 total.
    // commission = 12% of £40 = £4.80; vendorPayoutPence = 4449 − 200 − 480 = 3769.
    // The OLD batch formula (gross − commission) would pay 4449 − 480 = 3969,
    // handing the vendor the £2.00 service fee. Net must use vendorPayoutPence.
    const totals = aggregateVendorBatch({
      vendorId: 'v1',
      vendorUserId: 'u1',
      commissionBps: 1200,
      hasOpenDispute: false,
      orders: [{ id: 'o1', totalPence: 4449, vendorPayoutPence: 3769, commissionPence: 480 }],
      refundDeductionsPence: 0,
    });
    expect(totals.netPence).toBe(3769);
    expect(totals.netPence).not.toBe(4449 - 480); // 3969 was the leak
    expect(totals.grossPence).toBe(4449);
    expect(totals.commissionPence).toBe(480);
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
      id: 'p1',
      vendorId: 'v1',
      amountPence: 1000,
      status: PayoutStatus.draft,
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
      status: PayoutStatus.held,
      vendor: { stripeAccountId: 'acct', payoutsEnabled: true, userId: 'vu' },
      amountPence: 1000,
    });
    await expect(svc.approvePayout('p1', finance)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws if vendor payouts disabled', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      status: PayoutStatus.draft,
      vendor: { stripeAccountId: null, payoutsEnabled: false, userId: 'vu' },
      amountPence: 1000,
    });
    await expect(svc.approvePayout('p1', finance)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('CAS guard: refuses when status changed concurrently', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      status: PayoutStatus.draft,
      vendor: { stripeAccountId: 'acct', payoutsEnabled: true, userId: 'vu' },
      amountPence: 1000,
    });
    prisma.payout.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.approvePayout('p1', finance)).rejects.toThrow(/concurrently/i);
  });

  it('happy path: transfers, marks transferred, notifies vendor', async () => {
    const { svc, prisma, stripe, queue } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      id: 'p1',
      vendorId: 'v1',
      amountPence: 2450,
      status: PayoutStatus.draft,
      vendor: { stripeAccountId: 'acct_1', payoutsEnabled: true, userId: 'vu1' },
    });
    prisma.payout.updateMany.mockResolvedValueOnce({ count: 1 });
    stripe.createTransfer.mockResolvedValueOnce({ id: 'tr_1' });
    prisma.payout.update.mockResolvedValueOnce({ id: 'p1', status: PayoutStatus.transferred });

    const out = await svc.approvePayout('p1', finance);

    expect(stripe.createTransfer).toHaveBeenCalledWith({
      amountPence: 2450,
      destinationAccountId: 'acct_1',
      payoutId: 'p1',
      idempotencyKey: 'payout-transfer-p1',
    });
    expect(prisma.payout.update.mock.calls[0][0].data).toMatchObject({
      status: PayoutStatus.transferred,
      stripeTransferId: 'tr_1',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'payout_transferred',
      expect.objectContaining({ payoutId: 'p1' }),
    );
    expect(out).toBeDefined();
  });

  it('marks failed when stripe throws', async () => {
    const { svc, prisma, stripe } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      id: 'p1',
      vendorId: 'v1',
      amountPence: 1000,
      status: PayoutStatus.draft,
      vendor: { stripeAccountId: 'acct', payoutsEnabled: true, userId: 'vu' },
    });
    prisma.payout.updateMany.mockResolvedValueOnce({ count: 1 });
    stripe.createTransfer.mockRejectedValueOnce(new Error('bank down'));
    prisma.payout.update.mockResolvedValueOnce({});

    await expect(svc.approvePayout('p1', finance)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payout.update.mock.calls[0][0].data).toMatchObject({
      status: PayoutStatus.failed,
      failureReason: 'bank down',
    });
  });
});

describe('PayoutsService.runWeeklyBatch (refund netting)', () => {
  function build() {
    const prisma = makePrisma();
    const svc = new PayoutsService(prisma as any, makeStripe() as any, makeQueue() as any);
    return { svc, prisma };
  }

  it('deducts only the vendor clawback, netting the Feastpot-absorbed credit', async () => {
    const { svc, prisma } = build();
    // One delivered order, fully refunded: customer got £44.49 back; the vendor
    // should be clawed back only their £37.69 earnings, NOT the £6.80 Feastpot
    // absorbed (service fee + commission).
    prisma.order.findMany.mockResolvedValueOnce([
      {
        id: 'o1',
        vendorId: 'v1',
        totalPence: 4449,
        vendorPayoutPence: 3769,
        commissionPence: 480,
        vendor: { id: 'v1', userId: 'u1', commissionBps: 1200, payoutsEnabled: true },
      },
    ]);
    prisma.payout.findFirst.mockResolvedValueOnce(null);
    // First aggregate = refund rows (negative); second = credit rows (positive).
    prisma.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amountPence: -4449 } })
      .mockResolvedValueOnce({ _sum: { amountPence: 680 } });
    prisma.dispute.count.mockResolvedValueOnce(0);
    prisma.payout.create.mockResolvedValueOnce({ id: 'p1' });

    await svc.runWeeklyBatch(new Date('2025-11-04T12:00:00Z'));

    const data = prisma.payout.create.mock.calls[0][0].data;
    // refundsPence = 4449 − 680 = 3769 (the clawback), NOT 4449 (the full refund).
    expect(data.refundsPence).toBe(3769);
    // net = vendorPayout 3769 − clawback 3769 = 0 (vendor neither paid nor over-charged).
    expect(data.amountPence).toBe(0);
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
    await expect(svc.holdPayout('p1', 'reason', support)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses to hold a transferred payout', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      status: PayoutStatus.transferred,
      vendorId: 'v1',
      vendor: { userId: 'u' },
    });
    await expect(svc.holdPayout('p1', 'reason', finance)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('CAS guard rejects when status changed concurrently', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      status: PayoutStatus.draft,
      vendorId: 'v1',
      vendor: { userId: 'u' },
    });
    prisma.payout.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.holdPayout('p1', 'reason', finance)).rejects.toThrow(/concurrently/i);
  });

  it('happy path holds + notifies', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique
      .mockResolvedValueOnce({
        status: PayoutStatus.draft,
        vendorId: 'v1',
        vendor: { userId: 'vu' },
      })
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
    const out = await svc.list(
      { id: 'u', role: UserRole.vendor, email: 'x', token: 't' } as any,
      {} as any,
    );
    expect(out).toEqual({ data: [], nextCursor: null });
  });
});

describe('PayoutsService.listPayoutOrders (vendor scoping)', () => {
  function build() {
    const prisma = {
      ...makePrisma(),
      order: { findMany: jest.fn() as Mock },
    };
    const svc = new PayoutsService(prisma as any, makeStripe() as any, makeQueue() as any);
    return { svc, prisma };
  }

  it('throws 404 when payout not found', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce(null);
    await expect(
      svc.listPayoutOrders('p1', { id: 'u', role: UserRole.vendor, email: 'x', token: 't' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("forbids a vendor from seeing another vendor's payout orders", async () => {
    const { svc, prisma } = build();
    // Payout belongs to vendor with userId 'owner-user', but requester is 'other-user'.
    prisma.payout.findUnique.mockResolvedValueOnce({
      vendorId: 'v1',
      periodStart: new Date('2025-11-03T00:00:00Z'),
      periodEnd: new Date('2025-11-10T00:00:00Z'),
      vendor: { userId: 'owner-user' },
    });
    await expect(
      svc.listPayoutOrders('p1', {
        id: 'other-user',
        role: UserRole.vendor,
        email: 'x',
        token: 't',
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // Crucially, no order query was made (data access never reached).
    expect((prisma.order as any).findMany).not.toHaveBeenCalled();
  });

  it('forbids customers entirely', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      vendorId: 'v1',
      periodStart: null,
      periodEnd: null,
      vendor: { userId: 'u1' },
    });
    await expect(
      svc.listPayoutOrders('p1', {
        id: 'u1',
        role: UserRole.customer,
        email: 'x',
        token: 't',
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns orders for the payout owner with attribution source', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      vendorId: 'v1',
      periodStart: new Date('2025-11-03T00:00:00Z'),
      periodEnd: new Date('2025-11-10T00:00:00Z'),
      vendor: { userId: 'owner-user' },
    });
    (prisma.order as any).findMany.mockResolvedValueOnce([
      {
        id: 'o1',
        orderNumber: 'FP-001',
        deliveredAt: new Date('2025-11-05T12:00:00Z'),
        subtotalPence: 2000,
        commissionPence: 240,
        vendorPayoutPence: 1760,
        attribution: { resolvedSource: 'MARKETPLACE_FIRST' },
      },
      {
        id: 'o2',
        orderNumber: 'FP-002',
        deliveredAt: new Date('2025-11-06T10:00:00Z'),
        subtotalPence: 1500,
        commissionPence: 0,
        vendorPayoutPence: 1500,
        attribution: { resolvedSource: 'VENDOR_REFERRED' },
      },
    ]);

    const out = await svc.listPayoutOrders('p1', {
      id: 'owner-user',
      role: UserRole.vendor,
      email: 'x',
      token: 't',
    } as any);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      orderNumber: 'FP-001',
      commissionPence: 240,
      attributionSource: 'MARKETPLACE_FIRST',
    });
    // VENDOR_REFERRED orders must show £0 commission.
    expect(out[1]).toMatchObject({
      orderNumber: 'FP-002',
      commissionPence: 0,
      attributionSource: 'VENDOR_REFERRED',
    });
  });

  it("finance user can view any vendor's payout orders", async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      vendorId: 'v2',
      periodStart: new Date('2025-11-03T00:00:00Z'),
      periodEnd: new Date('2025-11-10T00:00:00Z'),
      vendor: { userId: 'some-vendor-user' },
    });
    (prisma.order as any).findMany.mockResolvedValueOnce([]);

    const out = await svc.listPayoutOrders('p2', finance);
    expect(out).toEqual([]);
  });

  it('returns empty list (not an error) for a payout with zero delivered orders', async () => {
    const { svc, prisma } = build();
    prisma.payout.findUnique.mockResolvedValueOnce({
      vendorId: 'v1',
      periodStart: new Date('2025-11-03T00:00:00Z'),
      periodEnd: new Date('2025-11-10T00:00:00Z'),
      vendor: { userId: 'owner-user' },
    });
    (prisma.order as any).findMany.mockResolvedValueOnce([]);

    const out = await svc.listPayoutOrders('p1', {
      id: 'owner-user',
      role: UserRole.vendor,
      email: 'x',
      token: 't',
    } as any);
    expect(out).toEqual([]);
  });
});
