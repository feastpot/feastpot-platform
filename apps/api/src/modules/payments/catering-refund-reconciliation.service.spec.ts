import { CateringRefundReconciliationService } from './catering-refund-reconciliation.service';

describe('CateringRefundReconciliationService', () => {
  it('replays a no-ID durable operation and completes it through PaymentsService', async () => {
    const operation = {
      id: 'op-1',
      cateringBookingId: 'booking-1',
      paymentIntentId: 'pi-1',
      amountPence: 2500,
      idempotencyKey: 'refund-key',
      stripeRefundId: null,
      status: 'pending',
    };
    const prisma = {
      refundOperation: {
        findMany: jest.fn().mockResolvedValue([operation]),
        findUnique: jest.fn().mockResolvedValue({ ...operation, stripeRefundId: 'recovered-refund' }),
        update: jest.fn(),
      },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const stripe = {
      retrieveRefund: jest.fn().mockResolvedValue({ id: 'recovered-refund', status: 'succeeded' }),
      listRefunds: jest.fn(),
    };
    const payments = {
      recoverCateringRefundOperation: jest.fn().mockResolvedValue(undefined),
      createCateringRefund: jest.fn().mockResolvedValue(undefined),
      reconcileExternalCateringRefund: jest.fn(),
    };
    const service = new CateringRefundReconciliationService(
      prisma as never,
      stripe as never,
      payments as never,
    );

    await service.reconcilePendingCateringRefunds();

    expect(payments.recoverCateringRefundOperation).toHaveBeenCalledWith('op-1');
    expect(stripe.retrieveRefund).toHaveBeenCalledWith('recovered-refund');
    expect(payments.createCateringRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'booking-1',
        paymentIntentId: 'pi-1',
        amountPence: 2500,
        idempotencyKey: 'refund-key',
      }),
    );
  });

  it('paginates every catering capture and imports external refunds', async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({
      id: `capture-${String(index).padStart(3, '0')}`,
      stripeChargeId: `ch-${index}`,
    }));
    const last = [{ id: 'capture-100', stripeChargeId: 'ch-100' }];
    const prisma = {
      refundOperation: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(last) },
    };
    const stripe = {
      listRefunds: jest.fn(({ id }: { id: string }) => id).mockResolvedValue({
        data: [{ id: 're-external', amount: 100, status: 'succeeded' }],
      }),
    };
    const payments = { reconcileExternalCateringRefund: jest.fn() };
    const service = new CateringRefundReconciliationService(
      prisma as never,
      stripe as never,
      payments as never,
    );

    await service.reconcilePendingCateringRefunds();

    expect(prisma.payment.findMany).toHaveBeenCalledTimes(2);
    expect(stripe.listRefunds).toHaveBeenCalledTimes(101);
    expect(payments.reconcileExternalCateringRefund).toHaveBeenCalledTimes(101);
  });

  it('retries a pending transfer-reversal compensation before any refund replay', async () => {
    const operation = {
      id: 'op-comp',
      cateringBookingId: 'booking-1',
      reversalStatus: 'compensation_pending',
      stripeRefundId: 're-failed',
    };
    const prisma = {
      refundOperation: { findMany: jest.fn().mockResolvedValue([operation]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const payments = {
      recoverCateringRefundCompensation: jest.fn().mockResolvedValue(undefined),
      recoverCateringRefundOperation: jest.fn(),
      createCateringRefund: jest.fn(),
    };
    const service = new CateringRefundReconciliationService(
      prisma as never,
      {} as never,
      payments as never,
    );

    await service.reconcilePendingCateringRefunds();

    expect(payments.recoverCateringRefundCompensation).toHaveBeenCalledWith('op-comp');
    expect(payments.recoverCateringRefundOperation).not.toHaveBeenCalled();
    expect(payments.createCateringRefund).not.toHaveBeenCalled();
  });

  it('routes an asynchronously failed Stripe refund through ledger compensation', async () => {
    const operation = {
      id: 'op-failed',
      cateringBookingId: 'booking-1',
      paymentIntentId: 'pi-1',
      amountPence: 2500,
      idempotencyKey: 'refund-key',
      stripeRefundId: 're-failed',
      status: 'stripe_succeeded',
      reversalStatus: null,
    };
    const prisma = {
      refundOperation: {
        findMany: jest.fn().mockResolvedValue([operation]),
        findUnique: jest.fn().mockResolvedValue(operation),
      },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const stripe = {
      retrieveRefund: jest
        .fn()
        .mockResolvedValue({ id: 're-failed', status: 'failed', failure_reason: 'declined' }),
    };
    const payments = {
      compensateFailedRefund: jest.fn().mockResolvedValue(undefined),
      createCateringRefund: jest.fn(),
    };
    const service = new CateringRefundReconciliationService(
      prisma as never,
      stripe as never,
      payments as never,
    );

    await service.reconcilePendingCateringRefunds();

    expect(payments.compensateFailedRefund).toHaveBeenCalledWith('re-failed');
    expect(payments.createCateringRefund).not.toHaveBeenCalled();
  });
});