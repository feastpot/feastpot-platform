import type { Job } from 'bull';

import { StripeWebhookProcessor } from './stripe-webhook.processor';

type Mock<T = unknown> = jest.Mock<T>;

function makePrisma() {
  return {
    payment: { findFirst: jest.fn() as Mock },
    chargeback: { upsert: jest.fn().mockResolvedValue({}) as Mock },
  };
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
});
