import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentStatus, PaymentType, UserRole } from '@prisma/client';

import {
  computeCommissionReversal,
  LARGE_REFUND_THRESHOLD_PENCE,
  PaymentsService,
} from './payments.service';

type Mock<T = unknown> = jest.Mock<T>;

function makePrisma() {
  return {
    order: { findUnique: jest.fn() as Mock },
    payment: {
      findFirst: jest.fn() as Mock,
      create: jest.fn() as Mock,
      findMany: jest.fn() as Mock,
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountPence: 0 } }) as Mock,
    },
  };
}
function makeStripe() {
  return { capture: jest.fn() as Mock, refund: jest.fn() as Mock };
}
function makeQueue() {
  return { add: jest.fn().mockResolvedValue({ id: '1' }) as Mock };
}

describe('computeCommissionReversal', () => {
  it('rounds 1500bps of £10 → 150p commission, 850p vendor deduction', () => {
    expect(computeCommissionReversal(1000, 1500)).toEqual({
      refundedCommissionPence: 150,
      vendorRefundDeductionPence: 850,
    });
  });
  it('rounds half values', () => {
    // 333p * 1500 / 10000 = 49.95 → 50
    expect(computeCommissionReversal(333, 1500)).toEqual({
      refundedCommissionPence: 50,
      vendorRefundDeductionPence: 283,
    });
  });
  it('handles zero commission', () => {
    expect(computeCommissionReversal(500, 0)).toEqual({
      refundedCommissionPence: 0,
      vendorRefundDeductionPence: 500,
    });
  });
});

describe('PaymentsService.createRefund', () => {
  const support = { id: 'support-1', role: UserRole.support };
  const finance = { id: 'finance-1', role: UserRole.finance };

  function build() {
    const prisma = makePrisma();
    const stripe = makeStripe();
    const queue = makeQueue();
    const svc = new PaymentsService(prisma as any, stripe as any, queue as any);
    return { svc, prisma, stripe, queue };
  }

  it('forbids large refund for support role', async () => {
    const { svc } = build();
    await expect(
      svc.createRefund({ orderId: 'o-1', amountPence: LARGE_REFUND_THRESHOLD_PENCE + 1 }, support),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFound when order missing', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValueOnce(null);
    await expect(svc.createRefund({ orderId: 'o-1', amountPence: 100 }, finance)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects refund > order total', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValueOnce({
      id: 'o-1', customerId: 'c-1', vendorId: 'v-1', totalPence: 500,
      vendor: { commissionBps: 1500, userId: 'vu-1' },
    });
    await expect(svc.createRefund({ orderId: 'o-1', amountPence: 1000 }, finance)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('happy path: creates refund row + commission reversal + 2 notifications', async () => {
    const { svc, prisma, stripe, queue } = build();
    prisma.order.findUnique.mockResolvedValueOnce({
      id: 'o-1', customerId: 'c-1', vendorId: 'v-1', totalPence: 1000,
      vendor: { commissionBps: 1500, userId: 'vu-1' },
    });
    prisma.payment.findFirst.mockResolvedValueOnce({ stripePaymentIntentId: 'pi_1' });
    stripe.refund.mockResolvedValueOnce({ id: 're_1', charge: 'ch_1' });
    prisma.payment.create
      .mockResolvedValueOnce({ id: 'pay-refund' })
      .mockResolvedValueOnce({ id: 'pay-credit' });

    const out = await svc.createRefund({ orderId: 'o-1', amountPence: 1000 }, finance);

    expect(stripe.refund).toHaveBeenCalledWith('pi_1', 1000);
    expect(out.reversal).toEqual({ refundedCommissionPence: 150, vendorRefundDeductionPence: 850 });
    // First create: negative refund row of full amount → type = refund
    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
      type: PaymentType.refund,
      status: PaymentStatus.succeeded,
      amountPence: -1000,
      stripePaymentIntentId: 'pi_1',
      stripeRefundId: 're_1',
    });
    // Second create: positive credit row for 150p commission reversal
    expect(prisma.payment.create.mock.calls[1][0].data).toMatchObject({
      type: PaymentType.credit,
      amountPence: 150,
    });
    // Two notifications enqueued
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith('refund_issued_customer', expect.objectContaining({ amountPence: 1000 }));
    expect(queue.add).toHaveBeenCalledWith('refund_deducted_vendor', expect.objectContaining({ deductionPence: 850 }));
  });

  it('partial refund uses partial_refund type', async () => {
    const { svc, prisma, stripe } = build();
    prisma.order.findUnique.mockResolvedValueOnce({
      id: 'o-1', customerId: 'c-1', vendorId: 'v-1', totalPence: 1000,
      vendor: { commissionBps: 1500, userId: 'vu-1' },
    });
    prisma.payment.findFirst.mockResolvedValueOnce({ stripePaymentIntentId: 'pi_1' });
    stripe.refund.mockResolvedValueOnce({ id: 're_1', charge: 'ch_1' });
    prisma.payment.create.mockResolvedValue({ id: 'p' });

    await svc.createRefund({ orderId: 'o-1', amountPence: 200 }, finance);
    expect(prisma.payment.create.mock.calls[0][0].data.type).toBe(PaymentType.partial_refund);
  });
});
