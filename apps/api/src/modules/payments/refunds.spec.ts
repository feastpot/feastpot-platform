import { OrderStatus, PaymentStatus, PaymentType, PayoutStatus, UserRole } from '@prisma/client';

import {
  computeIncrementalRefundSplit,
  computeRefundSplit,
  PaymentsService,
} from './payments.service';

describe('computeRefundSplit', () => {
  const econ = {
    subtotalPence: 10000,
    serviceFeePence: 800,
    deliveryFeePence: 500,
    discountPence: 0,
    commissionPence: 1200,
  };
  // vendorEarned = 10000 + 500 - 0 - 1200 = 9300

  it('full refund: vendor pays back exactly what they earned; Feastpot absorbs the rest', () => {
    const total = 11300; // subtotal + service fee + delivery
    const split = computeRefundSplit(total, econ, true);
    expect(split.refundFraction).toBe(1);
    expect(split.vendorClawbackPence).toBe(9300);
    expect(split.feastpotAbsorbedPence).toBe(2000); // service fee 800 + commission 1200
    expect(split.commissionRefundedPence).toBe(1200);
    expect(split.serviceFeeAbsorbedPence).toBe(800);
    // Ledger invariant: clawback + absorbed = customer refund.
    expect(split.vendorClawbackPence + split.feastpotAbsorbedPence).toBe(total);
  });

  it('partial refund: proportional to the food subtotal', () => {
    const split = computeRefundSplit(5000, econ, false);
    expect(split.refundFraction).toBe(0.5);
    expect(split.vendorClawbackPence).toBe(4650); // 9300 × 0.5
    expect(split.feastpotAbsorbedPence).toBe(350);
    expect(split.vendorClawbackPence + split.feastpotAbsorbedPence).toBe(5000);
  });

  it('vendor-referred order (zero commission): no commission to reverse, customer still whole', () => {
    const referred = { ...econ, commissionPence: 0 };
    const split = computeRefundSplit(11300, referred, true);
    expect(split.commissionRefundedPence).toBe(0);
    expect(split.vendorClawbackPence).toBe(10500); // subtotal + delivery
    expect(split.feastpotAbsorbedPence).toBe(800); // just the service fee
  });

  it('platform-funded discount: clawback drops by the discount; Feastpot funds the gap', () => {
    const discounted = { ...econ, discountPence: 1000 };
    const split = computeRefundSplit(11300, discounted, true);
    expect(split.vendorClawbackPence).toBe(8300); // vendor earned less due to discount
    expect(split.feastpotAbsorbedPence).toBe(3000);
  });

  it('never claws back more than the refund itself', () => {
    const split = computeRefundSplit(100, econ, false);
    expect(split.vendorClawbackPence).toBeLessThanOrEqual(100);
    expect(split.vendorClawbackPence).toBeGreaterThanOrEqual(0);
  });
});

// ─── createRefund idempotency + audit ────────────────────────────────────────

type AnyFn = jest.Mock;
interface MockTx {
  $executeRaw: AnyFn;
  payment: {
    aggregate: AnyFn;
    create: AnyFn;
    findUnique: AnyFn;
    findMany: AnyFn;
    updateMany: AnyFn;
  };
  order: { update: AnyFn; updateMany: AnyFn; findUnique: AnyFn };
  auditLog: { create: AnyFn; findFirst: AnyFn };
  vendor: { update: AnyFn };
  payout: { updateMany: AnyFn };
}

function makeMocks() {
  const tx: MockTx = {
    $executeRaw: jest.fn(),
    payment: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountPence: 0 } }),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'row-1', ...data }),
        ),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    order: {
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
    },
    auditLog: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    vendor: { update: jest.fn() },
    payout: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const order = {
    id: 'order-1',
    customerId: 'cust-1',
    vendorId: 'vend-1',
    status: OrderStatus.delivered,
    subtotalPence: 10000,
    serviceFeePence: 800,
    deliveryFeePence: 500,
    discountPence: 0,
    commissionPence: 1200,
    totalPence: 11300,
    foundingAllowanceAppliedPence: 0,
    deliveredAt: new Date('2026-08-10T12:00:00Z'),
    vendor: { userId: 'vuser-1', stripeAccountId: 'acct_v1' },
  };
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(order) },
    payment: {
      findFirst: jest.fn().mockResolvedValue({ stripePaymentIntentId: 'pi_1' }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountPence: 0 } }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    payout: { findFirst: jest.fn().mockResolvedValue(null) },
    vendor: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: MockTx) => Promise<unknown>) => fn(tx)),
  };
  const stripe = {
    refund: jest.fn().mockResolvedValue({ id: 're_1', charge: 'ch_1' }),
    createTransferReversal: jest.fn(),
    createTransfer: jest.fn().mockResolvedValue({ id: 'tr_comp' }),
  };
  const notifications = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const service = new PaymentsService(prisma as never, stripe as never, notifications as never);
  return { service, prisma, stripe, tx, notifications };
}

const actor = { id: 'admin-1', role: UserRole.admin };

describe('createRefund', () => {
  it('writes the audit log atomically with the money rows', async () => {
    const { service, tx } = makeMocks();
    await service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-1');
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const meta = tx.auditLog.create.mock.calls[0][0].data.metadata as Record<string, unknown>;
    expect(meta.customerRefundPence).toBe(11300);
    expect(meta.vendorClawbackPence).toBe(9300);
    expect(meta.previousOrderStatus).toBe(OrderStatus.delivered);
  });

  it('sets the order status to refunded on a full refund, atomically in the transaction', async () => {
    const { service, tx } = makeMocks();
    await service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-1');
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: OrderStatus.refunded },
    });
  });

  it('two identical requests with the same idempotency key create one Stripe refund row', async () => {
    const { service, prisma, stripe } = makeMocks();
    const first = await service.createRefund(
      { orderId: 'order-1', amountPence: 11300 },
      actor,
      'admin-refund:order-1:req-1',
    );
    // Second call: Stripe returns the SAME refund (idempotency key); our
    // ledger row now exists, so the service short-circuits before the tx.
    prisma.payment.findUnique.mockResolvedValue({ id: 'row-1', stripeRefundId: 're_1' });
    const second = await service.createRefund(
      { orderId: 'order-1', amountPence: 11300 },
      actor,
      'admin-refund:order-1:req-1',
    );
    expect(stripe.refund).toHaveBeenCalledTimes(2); // same key → same Stripe refund object
    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // only ONE ledger write
    expect(second).toHaveProperty('duplicate', true);
    expect(first).not.toHaveProperty('duplicate');
  });

  it('matches the vendor-period BATCH payout shape (orderId null) when locating paid-out funds', async () => {
    const { service, prisma, stripe } = makeMocks();
    prisma.payout.findFirst.mockResolvedValue({
      id: 'po-batch',
      status: PayoutStatus.transferred,
      stripeTransferId: 'tr_batch',
      amountPence: 50000,
    });
    stripe.createTransferReversal.mockResolvedValue({ id: 'trr_1' });
    await service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-1');
    // The lookup must include the batch-created shape: orderId=null with a
    // delivery-date window, not just a per-order payout row.
    const where = prisma.payout.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { orderId: 'order-1' },
        expect.objectContaining({
          vendorId: 'vend-1',
          orderId: null,
          periodStart: { lte: expect.any(Date) },
          periodEnd: { gt: expect.any(Date) },
        }),
      ]),
    );
    expect(stripe.createTransferReversal).toHaveBeenCalledWith(
      expect.objectContaining({ transferId: 'tr_batch', amountPence: 9300 }),
    );
  });

  it('deducts the clawback from a NOT-yet-transferred covering payout instead of reversing', async () => {
    const { service, prisma, stripe, tx } = makeMocks();
    prisma.payout.findFirst.mockResolvedValue({
      id: 'po-pending',
      status: PayoutStatus.approved,
      stripeTransferId: null,
      amountPence: 50000,
    });
    await service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-1');
    expect(stripe.createTransferReversal).not.toHaveBeenCalled();
    expect(tx.payout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'po-pending', amountPence: { gte: 9300 } }),
        data: { amountPence: { decrement: 9300 }, refundsPence: { increment: 9300 } },
      }),
    );
  });

  it('aborts when the pending payout cannot absorb the clawback (transferred concurrently)', async () => {
    const { service, prisma, tx } = makeMocks();
    prisma.payout.findFirst.mockResolvedValue({
      id: 'po-pending',
      status: PayoutStatus.approved,
      stripeTransferId: null,
      amountPence: 5000,
    });
    tx.payout.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-1'),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ADJUSTMENT_FAILED' } });
  });

  it('fails loudly (no refund issued) when the vendor was paid out and the transfer reversal fails', async () => {
    const { service, prisma, stripe } = makeMocks();
    prisma.payout.findFirst.mockResolvedValue({
      id: 'po-1',
      status: PayoutStatus.transferred,
      stripeTransferId: 'tr_1',
      amountPence: 50000,
    });
    stripe.createTransferReversal.mockRejectedValue(new Error('balance_insufficient'));
    await expect(
      service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-1'),
    ).rejects.toMatchObject({ response: { code: 'TRANSFER_REVERSAL_FAILED' } });
    expect(stripe.refund).not.toHaveBeenCalled();
  });

  it('pays the clawback back to the vendor when the refund fails AFTER a successful reversal', async () => {
    const { service, prisma, stripe } = makeMocks();
    prisma.payout.findFirst.mockResolvedValue({
      id: 'po-1',
      status: PayoutStatus.transferred,
      stripeTransferId: 'tr_1',
      amountPence: 50000,
    });
    stripe.createTransferReversal.mockResolvedValue({ id: 'trr_1' });
    stripe.refund.mockRejectedValue(new Error('refund creation failed'));
    await expect(
      service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-1'),
    ).rejects.toThrow('refund creation failed');
    // Compensating transfer returns the 9300p clawback to the vendor,
    // attempt-scoped so a later retry's compensation is not swallowed.
    expect(stripe.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPence: 9300,
        destinationAccountId: 'acct_v1',
        idempotencyKey: 'comp:reversal:key-1:0',
      }),
    );
    // The compensation is recorded so the next attempt bumps the counter.
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'transfer_reversal_compensated' }),
      }),
    );
  });

  it('never claws back more than total vendor earnings across sequential partials', () => {
    // £113 order, £100 subtotal: 5000p then 6300p refunds. Independent splits
    // would claw 50% + 63% of earnings (>100%); incremental differencing must
    // cap the SUM at vendor earnings (9300p).
    const econ = {
      subtotalPence: 10000,
      serviceFeePence: 800,
      deliveryFeePence: 500,
      discountPence: 0,
      commissionPence: 1200,
    };
    const first = computeIncrementalRefundSplit(0, 5000, econ, 11300);
    const second = computeIncrementalRefundSplit(5000, 6300, econ, 11300);
    expect(first.vendorClawbackPence + second.vendorClawbackPence).toBe(9300);
    // Each refund's rows still net internally: clawback + absorbed = amount.
    expect(first.vendorClawbackPence + first.feastpotAbsorbedPence).toBe(5000);
    expect(second.vendorClawbackPence + second.feastpotAbsorbedPence).toBe(6300);
  });

  it('returns the committed row on a same-requestId retry instead of failing the cumulative guard', async () => {
    const { service, prisma, stripe } = makeMocks();
    // Prior successful attempt left its audit trail + row; the order is now
    // fully refunded so the cumulative guard WOULD reject a naive retry.
    prisma.auditLog.findFirst.mockResolvedValue({
      metadata: {
        refundPaymentId: 'row-prior',
        idempotencyKey: 'key-1',
        vendorClawbackPence: 9300,
        feastpotAbsorbedPence: 2000,
      },
    });
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: 'row-prior',
      status: PaymentStatus.succeeded,
    });
    const result = await service.createRefund(
      { orderId: 'order-1', amountPence: 11300 },
      actor,
      'key-1',
    );
    expect(result).toMatchObject({ duplicate: true, refund: { id: 'row-prior' } });
    expect(stripe.refund).not.toHaveBeenCalled();
  });

  it('rejects reuse of a requestId whose refund FAILED (Stripe would replay the failed refund)', async () => {
    const { service, prisma } = makeMocks();
    prisma.auditLog.findFirst.mockResolvedValue({
      metadata: { refundPaymentId: 'row-prior', idempotencyKey: 'key-1' },
    });
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: 'row-prior',
      status: PaymentStatus.failed,
    });
    await expect(
      service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-1'),
    ).rejects.toMatchObject({ response: { code: 'REFUND_PREVIOUSLY_FAILED' } });
  });

  it('excludes FAILED refund rows from the cumulative guard so a reissue is possible', async () => {
    const { service, prisma } = makeMocks();
    await service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-2');
    const where = (prisma.payment.aggregate as jest.Mock).mock.calls[0][0].where;
    expect(where.status).toEqual({ not: PaymentStatus.failed });
  });

  it('marks the order fully refunded when cumulative partial refunds reach the total', async () => {
    const { service, prisma, tx } = makeMocks();
    // 5000p already refunded; this 6300p partial brings the total to 11300p.
    (prisma.payment.aggregate as jest.Mock).mockResolvedValue({ _sum: { amountPence: -5000 } });
    tx.payment.aggregate.mockResolvedValue({ _sum: { amountPence: -5000 } });
    await service.createRefund({ orderId: 'order-1', amountPence: 6300 }, actor, 'key-1');
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: OrderStatus.refunded } }),
    );
  });

  it('does NOT compensate a shared reversal when a concurrent same-requestId call committed the refund', async () => {
    const { service, prisma, stripe } = makeMocks();
    prisma.payout.findFirst.mockResolvedValue({
      id: 'po-1',
      status: PayoutStatus.transferred,
      stripeTransferId: 'tr_1',
      amountPence: 50000,
    });
    stripe.createTransferReversal.mockResolvedValue({ id: 'trr_1' });
    // Loser's timeline: pre-commit duplicate check sees nothing...
    (prisma.payment.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      // ...its ledger tx loses the in-tx race, and the post-catch re-check
      // finds the row the WINNER committed for the same Stripe refund.
      .mockResolvedValueOnce({ id: 'row-winner', stripeRefundId: 're_1' });
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      Object.assign(new Error('CUMULATIVE_REFUND_EXCEEDS_TOTAL'), {}),
    );

    const result = await service.createRefund(
      { orderId: 'order-1', amountPence: 11300 },
      actor,
      'key-1',
    );

    // The request as a whole succeeded (once); compensating the shared
    // reversal here would leave the vendor whole while the customer got paid.
    expect(result).toHaveProperty('duplicate', true);
    expect(stripe.createTransfer).not.toHaveBeenCalled();
  });

  it('compensates the reversal when persisting the reversal record fails (vendor debited, no refund coming)', async () => {
    const { service, prisma, stripe } = makeMocks();
    prisma.payout.findFirst.mockResolvedValue({
      id: 'po-1',
      status: PayoutStatus.transferred,
      stripeTransferId: 'tr_1',
      amountPence: 50000,
    });
    stripe.createTransferReversal.mockResolvedValue({ id: 'trr_1' });
    // The transfer_reversal_created persistence write fails...
    (prisma.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-1'),
    ).rejects.toThrow('db down');
    // ...so the vendor's funds are paid back before surfacing the failure.
    expect(stripe.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amountPence: 9300, destinationAccountId: 'acct_v1' }),
    );
    expect(stripe.refund).not.toHaveBeenCalled();
  });

  it('writes the FINAL partial of a cumulative full refund as a full refund (type + audit)', async () => {
    const { service, prisma, tx } = makeMocks();
    (prisma.payment.aggregate as jest.Mock).mockResolvedValue({ _sum: { amountPence: -5000 } });
    tx.payment.aggregate.mockResolvedValue({ _sum: { amountPence: -5000 } });
    await service.createRefund({ orderId: 'order-1', amountPence: 6300 }, actor, 'key-1');
    const refundRow = tx.payment.create.mock.calls
      .map((c) => c[0].data as { type: PaymentType })
      .find((d) => d.type === PaymentType.refund || d.type === PaymentType.partial_refund);
    expect(refundRow?.type).toBe(PaymentType.refund); // cumulative, not per-amount
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ partial: false }),
        }),
      }),
    );
  });

  it('uses a NEW reversal idempotency key after a prior attempt was compensated', async () => {
    const { service, prisma, stripe } = makeMocks();
    prisma.payout.findFirst.mockResolvedValue({
      id: 'po-1',
      status: PayoutStatus.transferred,
      stripeTransferId: 'tr_1',
      amountPence: 50000,
    });
    prisma.auditLog.count.mockResolvedValue(1); // one prior compensated attempt
    stripe.createTransferReversal.mockResolvedValue({ id: 'trr_2' });
    await service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-1');
    // Reusing the plain key would make Stripe replay the ORIGINAL (paid-back)
    // reversal and never pull funds again.
    expect(stripe.createTransferReversal).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'reversal:key-1:1' }),
    );
  });
});

describe('compensateFailedRefund', () => {
  it('nets out the credit rows, restores order status, and audits the compensation', async () => {
    const { service, prisma, tx } = makeMocks();
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: 'refund-row-1',
      orderId: 'order-1',
      amountPence: -11300,
    });
    tx.payment.findMany.mockResolvedValue([
      { id: 'credit-1', amountPence: 800, userId: 'admin-1' },
      { id: 'credit-2', amountPence: 1200, userId: 'admin-1' },
    ]);
    tx.auditLog.findFirst.mockResolvedValue({
      metadata: { previousOrderStatus: OrderStatus.delivered, allowanceRestoredPence: 0 },
    });

    const result = await service.compensateFailedRefund('re_1');

    expect(result).toMatchObject({
      orderId: 'order-1',
      refundAmountPence: 11300,
      compensationCreditPence: 9300, // 11300 refund − 2000 absorbed credits
      reversalPence: 0,
    });
    // ONE positive credit so refund(-11300) + credits(+2000) + comp(+9300) = 0
    // even though the payout batch aggregates rows regardless of status.
    const created = tx.payment.create.mock.calls.map((c) => c[0].data as { amountPence: number });
    expect(created.map((d) => d.amountPence)).toEqual([9300]);
    // Order status restored via CAS on refunded/partially_refunded.
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: OrderStatus.delivered } }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'refund_failed_compensated' }),
      }),
    );
  });

  it('pays a prior transfer reversal back to the vendor on ASYNC refund failure', async () => {
    const { service, prisma, stripe, tx } = makeMocks();
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: 'refund-row-1',
      orderId: 'order-1',
      amountPence: -11300,
    });
    tx.payment.findMany.mockResolvedValue([{ id: 'credit-1', amountPence: 2000, userId: 'a' }]);
    tx.auditLog.findFirst.mockResolvedValue({
      metadata: {
        previousOrderStatus: OrderStatus.delivered,
        allowanceRestoredPence: 0,
        reversalPence: 9300,
        reversalKeyBase: 'reversal:key-1',
        reversalAttempt: 0,
        reversalPayoutId: 'po-1',
      },
    });
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      vendor: { stripeAccountId: 'acct_v1' },
    });

    await service.compensateFailedRefund('re_1');

    // Ledger compensation alone is not enough - the reversal pulled real money
    // off the vendor's connected account; it must be transferred back.
    expect(stripe.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPence: 9300,
        destinationAccountId: 'acct_v1',
        idempotencyKey: 'comp:reversal:key-1:0',
      }),
    );
  });

  it('restores a pending payout that had absorbed the clawback', async () => {
    const { service, prisma, tx } = makeMocks();
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: 'refund-row-1',
      orderId: 'order-1',
      amountPence: -11300,
    });
    tx.payment.findMany.mockResolvedValue([{ id: 'credit-1', amountPence: 2000, userId: 'a' }]);
    tx.auditLog.findFirst.mockResolvedValue({
      metadata: {
        previousOrderStatus: OrderStatus.delivered,
        allowanceRestoredPence: 0,
        adjustedPayoutId: 'po-pending',
      },
    });

    await service.compensateFailedRefund('re_1');

    expect(tx.payout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'po-pending' }),
        data: { amountPence: { increment: 9300 }, refundsPence: { decrement: 9300 } },
      }),
    );
  });

  it('is exactly-once: a second call finds the row already failed and does nothing', async () => {
    const { service, prisma, tx } = makeMocks();
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: 'refund-row-1',
      orderId: 'order-1',
      amountPence: -11300,
    });
    tx.payment.updateMany.mockResolvedValue({ count: 0 }); // CAS lost
    const result = await service.compensateFailedRefund('re_1');
    expect(result).toBeNull();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('ignores refunds that are not ours', async () => {
    const { service, prisma } = makeMocks();
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.compensateFailedRefund('re_unknown')).resolves.toBeNull();
  });
});

// ─── D-002: founding allowance restoration is inside the transaction ─────────

describe('createRefund - allowance restoration atomicity (D-002)', () => {
  it('calls tx.vendor.update inside the transaction when allowance was applied', async () => {
    const { service, prisma, tx } = makeMocks();
    // Order consumed 3000p of founding allowance.
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-1',
      customerId: 'cust-1',
      vendorId: 'vend-1',
      status: OrderStatus.delivered,
      subtotalPence: 10000,
      serviceFeePence: 800,
      deliveryFeePence: 500,
      discountPence: 0,
      commissionPence: 840, // 12% on (10000 - 3000 covered) = 7000
      totalPence: 11300,
      foundingAllowanceAppliedPence: 3000,
      deliveredAt: new Date('2026-08-10T12:00:00Z'),
      vendor: { userId: 'vuser-1', stripeAccountId: 'acct_v1' },
    });

    await service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-allow');

    // Full refund: refundFraction = 1; restorePence = 1 * 3000 = 3000.
    expect(tx.vendor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vend-1' },
        data: { foundingAllowanceUsedPence: { decrement: 3000 } },
      }),
    );
  });

  it('does NOT call tx.vendor.update when no allowance was applied', async () => {
    const { service, tx } = makeMocks();
    // Default mock order has foundingAllowanceAppliedPence: 0.
    await service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-noallow');
    expect(tx.vendor.update).not.toHaveBeenCalled();
  });

  it('restores proportionally on a partial refund', async () => {
    const { service, prisma, tx } = makeMocks();
    // Order: 10000p subtotal, 3000p allowance applied, 11300p total.
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-1',
      customerId: 'cust-1',
      vendorId: 'vend-1',
      status: OrderStatus.delivered,
      subtotalPence: 10000,
      serviceFeePence: 800,
      deliveryFeePence: 500,
      discountPence: 0,
      commissionPence: 840,
      totalPence: 11300,
      foundingAllowanceAppliedPence: 3000,
      deliveredAt: new Date('2026-08-10T12:00:00Z'),
      vendor: { userId: 'vuser-1', stripeAccountId: 'acct_v1' },
    });

    // Partial refund of 5000p = exactly 50% of the SUBTOTAL (refundFraction uses
    // amount / subtotalPence, not amount / totalPence per computeRefundSplit).
    // refundFraction = min(5000 / 10000, 1) = 0.5
    // restorePence = round(0.5 * 3000) = 1500.
    await service.createRefund({ orderId: 'order-1', amountPence: 5000 }, actor, 'key-partial');

    expect(tx.vendor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { foundingAllowanceUsedPence: { decrement: 1500 } },
      }),
    );
  });

  it('records allowanceRestoredPence in the audit log (same transaction)', async () => {
    const { service, prisma, tx } = makeMocks();
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-1',
      customerId: 'cust-1',
      vendorId: 'vend-1',
      status: OrderStatus.delivered,
      subtotalPence: 10000,
      serviceFeePence: 800,
      deliveryFeePence: 500,
      discountPence: 0,
      commissionPence: 840,
      totalPence: 11300,
      foundingAllowanceAppliedPence: 3000,
      deliveredAt: new Date('2026-08-10T12:00:00Z'),
      vendor: { userId: 'vuser-1', stripeAccountId: 'acct_v1' },
    });

    await service.createRefund({ orderId: 'order-1', amountPence: 11300 }, actor, 'key-audit');

    const auditCall = tx.auditLog.create.mock.calls.find(
      (c: unknown[]) =>
        (c[0] as { data: { action: string } }).data.action === 'refund_issued',
    );
    expect(auditCall).toBeDefined();
    const meta = (auditCall![0] as { data: { metadata: { allowanceRestoredPence: number } } }).data
      .metadata;
    expect(meta.allowanceRestoredPence).toBe(3000);
  });
});

// Referenced so the enum import stays meaningful if the test grows.
void PaymentStatus;
void PaymentType;
