import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentStatus, PaymentType, UserRole } from '@prisma/client';

import {
  computeRefundSplit,
  LARGE_REFUND_THRESHOLD_PENCE,
  PaymentsService,
} from './payments.service';

type Mock<T = unknown> = jest.Mock<T>;

function makePrisma() {
  const prisma: Record<string, unknown> = {
    order: { findUnique: jest.fn() as Mock },
    payment: {
      findFirst: jest.fn() as Mock,
      create: jest.fn() as Mock,
      findMany: jest.fn() as Mock,
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountPence: 0 } }) as Mock,
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) as Mock },
  };
  // Interactive $transaction: run the callback with the same prisma mock so the
  // payment.create calls inside the txn are recorded on the same spy.
  prisma.$transaction = jest.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  ) as Mock;
  return prisma as ReturnType<typeof makePrismaShape>;
}
function makePrismaShape() {
  return {
    order: { findUnique: jest.fn() as Mock },
    payment: {
      findFirst: jest.fn() as Mock,
      create: jest.fn() as Mock,
      findMany: jest.fn() as Mock,
      aggregate: jest.fn() as Mock,
    },
    auditLog: { create: jest.fn() as Mock },
    $transaction: jest.fn() as Mock,
  };
}
function makeStripe() {
  return { capture: jest.fn() as Mock, refund: jest.fn() as Mock };
}
function makeQueue() {
  return { add: jest.fn().mockResolvedValue({ id: '1' }) as Mock };
}

describe('computeRefundSplit', () => {
  // £40 food + £2.49 delivery + £2.00 service fee = £44.49 total.
  // commission = 12% of £40 = £4.80; vendorPayoutPence = 4000 + 249 − 480 = 3769.
  const econ = {
    subtotalPence: 4000,
    serviceFeePence: 200,
    deliveryFeePence: 249,
    discountPence: 0,
    commissionPence: 480,
  };

  it('full refund: clawback = subtotal + delivery − discount − commission (excludes service fee)', () => {
    const split = computeRefundSplit(4449, econ, true);
    expect(split.vendorClawbackPence).toBe(3769);
    // Must NOT be the full customer refund (4449) nor total − commission (3969).
    expect(split.vendorClawbackPence).not.toBe(4449);
    expect(split.vendorClawbackPence).not.toBe(4449 - 480);
    // Feastpot absorbs its service fee + the commission it gives back.
    expect(split.feastpotAbsorbedPence).toBe(680);
    expect(split.serviceFeeAbsorbedPence).toBe(200);
    expect(split.commissionRefundedPence).toBe(480);
  });

  it('partial refund: clawback is proportional to the food subtotal', () => {
    // Refunding £20 = 50% of the £40 subtotal → 0.5 × 3769 = 1884.5 → 1885.
    const split = computeRefundSplit(2000, econ, false);
    expect(split.refundFraction).toBeCloseTo(0.5);
    expect(split.vendorClawbackPence).toBe(1885);
    expect(split.feastpotAbsorbedPence).toBe(2000 - 1885);
  });

  it('caps the refund fraction at 100% of subtotal', () => {
    const split = computeRefundSplit(4449, econ, false);
    expect(split.refundFraction).toBe(1);
    expect(split.vendorClawbackPence).toBe(3769);
  });

  it('never claws back more than the customer was refunded', () => {
    // delivery-heavy order: vendorEarned (4000) could exceed a small refund.
    const split = computeRefundSplit(
      100,
      {
        subtotalPence: 100,
        serviceFeePence: 5,
        deliveryFeePence: 4000,
        discountPence: 0,
        commissionPence: 12,
      },
      true,
    );
    expect(split.vendorClawbackPence).toBe(100);
    expect(split.feastpotAbsorbedPence).toBe(0);
  });

  it('handles a zero subtotal without dividing by zero', () => {
    const split = computeRefundSplit(
      200,
      {
        subtotalPence: 0,
        serviceFeePence: 200,
        deliveryFeePence: 0,
        discountPence: 0,
        commissionPence: 0,
      },
      false,
    );
    expect(split.refundFraction).toBe(0);
    expect(split.vendorClawbackPence).toBe(0);
    expect(split.feastpotAbsorbedPence).toBe(200);
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
    await expect(
      svc.createRefund({ orderId: 'o-1', amountPence: 100 }, finance),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects refund > order total', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValueOnce({
      id: 'o-1',
      customerId: 'c-1',
      vendorId: 'v-1',
      totalPence: 500,
      vendor: { commissionBps: 1500, userId: 'vu-1' },
    });
    await expect(
      svc.createRefund({ orderId: 'o-1', amountPence: 1000 }, finance),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // £40 food + £2.49 delivery + £2.00 service fee = £44.49 total; commission £4.80.
  const fullOrder = {
    id: 'o-1',
    customerId: 'c-1',
    vendorId: 'v-1',
    subtotalPence: 4000,
    serviceFeePence: 200,
    deliveryFeePence: 249,
    discountPence: 0,
    commissionPence: 480,
    totalPence: 4449,
    vendor: { userId: 'vu-1' },
  };

  it('full refund: customer gets full total, vendor clawback excludes service fee', async () => {
    const { svc, prisma, stripe, queue } = build();
    prisma.order.findUnique.mockResolvedValueOnce(fullOrder);
    prisma.payment.findFirst.mockResolvedValueOnce({ stripePaymentIntentId: 'pi_1' });
    stripe.refund.mockResolvedValueOnce({ id: 're_1', charge: 'ch_1' });
    prisma.payment.create
      .mockResolvedValueOnce({ id: 'pay-refund' })
      .mockResolvedValueOnce({ id: 'pay-credit' });

    const out = await svc.createRefund({ orderId: 'o-1', amountPence: 4449 }, finance);

    // Customer is refunded the full total (Feastpot absorbs its service fee).
    expect(stripe.refund).toHaveBeenCalledWith('pi_1', 4449, undefined);
    expect(out.split.vendorClawbackPence).toBe(3769);
    expect(out.split.feastpotAbsorbedPence).toBe(680);
    // Refund row carries the FULL customer amount (for cumulative guard + Stripe recon).
    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
      type: PaymentType.refund,
      status: PaymentStatus.succeeded,
      amountPence: -4449,
      stripePaymentIntentId: 'pi_1',
      stripeRefundId: 're_1',
    });
    // Credit row carries the Feastpot-absorbed portion (netted in the payout batch).
    expect(prisma.payment.create.mock.calls[1][0].data).toMatchObject({
      type: PaymentType.credit,
      amountPence: 680,
    });
    // Audit log records who bore what, including the absorbed service fee.
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'refund_issued',
          metadata: expect.objectContaining({
            customerRefundPence: 4449,
            vendorClawbackPence: 3769,
            serviceFeePenceAbsorbed: 200,
          }),
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      'refund_issued_customer',
      expect.objectContaining({ amountPence: 4449 }),
    );
    // Vendor is deducted only what they earned, NOT the full refund.
    expect(queue.add).toHaveBeenCalledWith(
      'refund_deducted_vendor',
      expect.objectContaining({ deductionPence: 3769 }),
    );
  });

  it('partial refund: partial_refund type + clawback proportional to subtotal', async () => {
    const { svc, prisma, stripe } = build();
    prisma.order.findUnique.mockResolvedValueOnce(fullOrder);
    prisma.payment.findFirst.mockResolvedValueOnce({ stripePaymentIntentId: 'pi_1' });
    stripe.refund.mockResolvedValueOnce({ id: 're_1', charge: 'ch_1' });
    prisma.payment.create.mockResolvedValue({ id: 'p' });

    // Refund £20 of the £40 subtotal → 50% × 3769 = 1885 clawback.
    const out = await svc.createRefund({ orderId: 'o-1', amountPence: 2000 }, finance);
    expect(prisma.payment.create.mock.calls[0][0].data.type).toBe(PaymentType.partial_refund);
    expect(prisma.payment.create.mock.calls[0][0].data.amountPence).toBe(-2000);
    expect(out.split.vendorClawbackPence).toBe(1885);
    expect(prisma.payment.create.mock.calls[1][0].data).toMatchObject({
      type: PaymentType.credit,
      amountPence: 2000 - 1885,
    });
  });
});
