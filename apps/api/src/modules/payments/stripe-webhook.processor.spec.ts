import type { Job } from 'bull';

import { StripeWebhookProcessor } from './stripe-webhook.processor';

type Mock<T = unknown> = jest.Mock<T>;

function makePrisma() {
  const prisma: any = {
    payment: {
      findFirst: jest.fn() as Mock,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }) as Mock,
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountPence: null } }) as Mock,
      create: jest.fn().mockResolvedValue({ id: 'pay-x' }) as Mock,
    },
    chargeback: {
      upsert: jest.fn().mockResolvedValue({}) as Mock,
      // Default: no chargeback row found → lost-reconciliation no-ops.
      findUnique: jest.fn().mockResolvedValue(null) as Mock,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }) as Mock,
    },
    order: { findUnique: jest.fn() as Mock, update: jest.fn() as Mock },
    vendor: { update: jest.fn() as Mock },
    auditLog: { create: jest.fn().mockResolvedValue({}) as Mock },
    processedWebhookEvent: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }) as Mock,
    },
    // pg_advisory_xact_lock inside the reconciliation transaction.
    $executeRaw: jest.fn().mockResolvedValue(1) as Mock,
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  return prisma;
}

function build() {
  const prisma = makePrisma();
  const loyalty = { refundRedemption: jest.fn() } as unknown;
  const proc = new StripeWebhookProcessor(prisma as any, loyalty as any);
  return { proc, prisma };
}

function disputeJob(type: string, dispute: Record<string, unknown>): Job<any> {
  return { data: { id: 'evt_1', type, data: dispute } } as Job<any>;
}

describe('StripeWebhookProcessor chargebacks', () => {
  const baseDispute = {
    id: 'dp_1',
    charge: 'ch_1',
    payment_intent: 'pi_1',
    amount: 2500,
    currency: 'gbp',
    status: 'needs_response',
    reason: 'fraudulent',
    created: 1_700_000_000,
    evidence_details: { due_by: 1_700_500_000 },
  };

  it('records a created chargeback linked to the matching order/payment', async () => {
    const { proc, prisma } = build();
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', orderId: 'order-1' });

    await proc.onDisputeCreated(disputeJob('charge.dispute.created', baseDispute));

    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ stripeChargeId: 'ch_1' }, { stripePaymentIntentId: 'pi_1' }] },
      }),
    );
    const arg = prisma.chargeback.upsert.mock.calls[0]![0];
    expect(arg.where).toEqual({ stripeDisputeId: 'dp_1' });
    expect(arg.create).toMatchObject({
      stripeDisputeId: 'dp_1',
      orderId: 'order-1',
      paymentId: 'pay-1',
      amountPence: 2500,
      currency: 'GBP',
      status: 'needs_response',
      reason: 'fraudulent',
    });
    expect(arg.create.evidenceDueBy).toEqual(new Date(1_700_500_000 * 1000));
    expect(arg.create.openedAt).toEqual(new Date(1_700_000_000 * 1000));
    expect(arg.create.closedAt).toBeNull();
  });

  it('still records a chargeback when no local payment matches', async () => {
    const { proc, prisma } = build();
    prisma.payment.findFirst.mockResolvedValue(null);

    await proc.onDisputeCreated(disputeJob('charge.dispute.created', baseDispute));

    const arg = prisma.chargeback.upsert.mock.calls[0]![0];
    expect(arg.create.orderId).toBeNull();
    expect(arg.create.paymentId).toBeNull();
    expect(arg.create.stripeDisputeId).toBe('dp_1');
  });

  it('stamps closedAt on charge.dispute.closed', async () => {
    const { proc, prisma } = build();
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', orderId: 'order-1' });

    await proc.onDisputeClosed(
      disputeJob('charge.dispute.closed', { ...baseDispute, status: 'lost' }),
    );

    const arg = prisma.chargeback.upsert.mock.calls[0]![0];
    expect(arg.update.closedAt).toBeInstanceOf(Date);
    expect(arg.update.status).toBe('lost');
  });

  it('does not overwrite closedAt on a non-closing update', async () => {
    const { proc, prisma } = build();
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', orderId: 'order-1' });

    await proc.onDisputeUpdated(
      disputeJob('charge.dispute.updated', { ...baseDispute, status: 'under_review' }),
    );

    const arg = prisma.chargeback.upsert.mock.calls[0]![0];
    expect(arg.update.closedAt).toBeUndefined();
    expect(arg.update.status).toBe('under_review');
  });

  it('matches on payment_intent when charge id is absent', async () => {
    const { proc, prisma } = build();
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', orderId: 'order-1' });

    await proc.onDisputeCreated(
      disputeJob('charge.dispute.created', { ...baseDispute, charge: null }),
    );

    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ stripePaymentIntentId: 'pi_1' }] } }),
    );
  });

  it('ignores a dispute event with no id', async () => {
    const { proc, prisma } = build();
    await proc.onDisputeCreated(disputeJob('charge.dispute.created', { id: undefined }));
    expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    expect(prisma.chargeback.upsert).not.toHaveBeenCalled();
  });

  describe('lost-chargeback reconciliation', () => {
    // £40 food + £2.49 delivery + £2 service fee = £44.49; commission £4.80.
    const order = {
      id: 'order-1',
      customerId: 'cust-1',
      vendorId: 'vendor-1',
      status: 'delivered',
      totalPence: 4449,
      subtotalPence: 4000,
      serviceFeePence: 200,
      deliveryFeePence: 249,
      discountPence: 0,
      commissionPence: 480,
      foundingAllowanceAppliedPence: 0,
    };

    function buildLost() {
      const { proc, prisma } = build();
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', orderId: 'order-1' });
      prisma.chargeback.findUnique.mockResolvedValue({
        id: 'cb-1',
        orderId: 'order-1',
        amountPence: 4449,
        reconciledAt: null,
      });
      prisma.order.findUnique.mockResolvedValue(order);
      return { proc, prisma };
    }

    it('writes refund + provenance credits + audit rows when a dispute is lost', async () => {
      const { proc, prisma } = buildLost();

      await proc.onDisputeClosed(
        disputeJob('charge.dispute.closed', { ...baseDispute, status: 'lost', amount: 4449 }),
      );

      // CAS marked the chargeback reconciled.
      expect(prisma.chargeback.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cb-1', reconciledAt: null } }),
      );
      // Refund row: full disputed amount, negative.
      expect(prisma.payment.create.mock.calls[0]![0].data).toMatchObject({
        orderId: 'order-1',
        type: 'refund',
        amountPence: -4449,
      });
      // Explicit provenance credits: service fee 200 and commission 480.
      expect(prisma.payment.create.mock.calls[1]![0].data).toMatchObject({
        type: 'credit',
        amountPence: 200,
        failureReason: expect.stringContaining('service_fee_retained'),
      });
      expect(prisma.payment.create.mock.calls[2]![0].data).toMatchObject({
        type: 'credit',
        amountPence: 480,
        failureReason: expect.stringContaining('commission_refunded'),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'chargeback_lost_reconciled',
            metadata: expect.objectContaining({
              vendorClawbackPence: 3769,
              feastpotAbsorbedPence: 680,
            }),
          }),
        }),
      );
    });

    it('is idempotent: already-reconciled chargebacks write nothing', async () => {
      const { proc, prisma } = buildLost();
      prisma.chargeback.findUnique.mockResolvedValue({
        id: 'cb-1',
        orderId: 'order-1',
        amountPence: 4449,
        reconciledAt: new Date(),
      });

      await proc.onDisputeClosed(
        disputeJob('charge.dispute.closed', { ...baseDispute, status: 'lost' }),
      );

      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('caps the ledger amount when the order was already partially refunded', async () => {
      const { proc, prisma } = buildLost();
      // £30 already refunded → only £14.49 still refundable.
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amountPence: -3000 } });

      await proc.onDisputeClosed(
        disputeJob('charge.dispute.closed', { ...baseDispute, status: 'lost', amount: 4449 }),
      );

      expect(prisma.payment.create.mock.calls[0]![0].data).toMatchObject({
        type: 'refund',
        amountPence: -1449,
      });
    });

    it('skips ledger writes but marks reconciled on a fully-refunded order', async () => {
      const { proc, prisma } = buildLost();
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amountPence: -4449 } });

      await proc.onDisputeClosed(
        disputeJob('charge.dispute.closed', { ...baseDispute, status: 'lost' }),
      );

      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(prisma.chargeback.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cb-1', reconciledAt: null } }),
      );
    });

    it('does not reconcile when the chargeback has no matched order', async () => {
      const { proc, prisma } = build();
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.chargeback.findUnique.mockResolvedValue({
        id: 'cb-1',
        orderId: null,
        amountPence: 4449,
        reconciledAt: null,
      });

      await proc.onDisputeClosed(
        disputeJob('charge.dispute.closed', { ...baseDispute, status: 'lost' }),
      );

      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(prisma.chargeback.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe('StripeWebhookProcessor execution ownership', () => {
  it('allows only one concurrent execution of the same Bull job to reach side effects', async () => {
    const { proc, prisma } = build();
    let owner: string | null = null;
    prisma.processedWebhookEvent.updateMany.mockImplementation(async ({ data }: any) => {
      if (data.processingJobId && owner === null) {
        owner = data.processingJobId;
        return { count: 1 };
      }
      return { count: 0 };
    });
    const job = {
      id: 'same-bull-job',
      data: {
        id: 'evt_payment_duplicate',
        type: 'payment_intent.succeeded',
        data: { id: 'pi_duplicate', metadata: {} },
      },
    } as Job<any>;

    await Promise.all([proc.onIntentSucceeded(job), proc.onIntentSucceeded(job)]);

    expect(prisma.payment.updateMany).toHaveBeenCalledTimes(1);
  });
});
