import { FinancialReconciliationService } from './financial-reconciliation.service';

describe('FinancialReconciliationService', () => {
  const page = (data: any[]) => ({ data, has_more: false });

  function subject(args?: {
    captures?: any[];
    payouts?: any[];
    refunds?: any[];
    stripeCaptures?: any[];
    stripeTransfers?: any[];
    stripeRefunds?: any[];
  }) {
    const prisma = {
      payment: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(args?.captures ?? [])
          .mockResolvedValueOnce(args?.refunds ?? []),
      },
      payout: { findMany: jest.fn().mockResolvedValue(args?.payouts ?? []) },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    const stripe = {
      listPaymentIntents: jest.fn().mockResolvedValue(page(args?.stripeCaptures ?? [])),
      listTransfers: jest.fn().mockResolvedValue(page(args?.stripeTransfers ?? [])),
      listAllRefunds: jest.fn().mockResolvedValue(page(args?.stripeRefunds ?? [])),
    };
    return {
      service: new FinancialReconciliationService(prisma as never, stripe as never),
      prisma,
    };
  }

  const findingKinds = (prisma: any) =>
    prisma.auditLog.create.mock.calls.map(([call]: any[]) => call.data.metadata.kind);

  it('finds a captured Stripe payment with no local capture', async () => {
    const { service, prisma } = subject({
      stripeCaptures: [{ id: 'pi_missing', status: 'succeeded', amount: 1200 }],
    });

    await service.reconcile();

    expect(findingKinds(prisma)).toEqual(['missing_local_capture']);
  });

  it('finds a Stripe transfer with no matching local payout', async () => {
    const { service, prisma } = subject({
      stripeTransfers: [{ id: 'tr_missing', amount: 750, metadata: { payoutId: 'payout-absent' } }],
    });

    await service.reconcile();

    expect(findingKinds(prisma)).toEqual(['missing_local_payout']);
  });

  it('finds a transferred local payout with no Stripe transfer', async () => {
    const { service, prisma } = subject({
      payouts: [{ id: 'payout-1', stripeTransferId: 'tr_absent', amountPence: 750 }],
    });

    await service.reconcile();

    expect(findingKinds(prisma)).toEqual(['missing_stripe_transfer']);
  });

  it('finds a Stripe refund with no local ledger entry', async () => {
    const { service, prisma } = subject({
      stripeRefunds: [
        { id: 're_missing', status: 'succeeded', amount: 500, payment_intent: 'pi_1' },
      ],
    });

    await service.reconcile();

    expect(findingKinds(prisma)).toEqual(['missing_local_refund']);
  });

  it('finds amount mismatches when Stripe is greater than local', async () => {
    const { service, prisma } = subject({
      captures: [{ id: 'payment-1', stripePaymentIntentId: 'pi_1', amountPence: 999 }],
      stripeCaptures: [{ id: 'pi_1', status: 'succeeded', amount: 1000 }],
    });

    await service.reconcile();

    expect(findingKinds(prisma)).toEqual(['amount_mismatch']);
    expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({
      stripeAmountPence: 1000,
      localAmountPence: 999,
    });
  });

  it('finds amount mismatches when local is greater than Stripe', async () => {
    const { service, prisma } = subject({
      refunds: [{ id: 'payment-1', stripeRefundId: 're_1', amountPence: 501 }],
      stripeRefunds: [{ id: 're_1', status: 'succeeded', amount: 500, payment_intent: 'pi_1' }],
    });

    await service.reconcile();

    expect(findingKinds(prisma)).toEqual(['amount_mismatch']);
    expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({
      stripeAmountPence: 500,
      localAmountPence: 501,
    });
  });

  it('does not create a duplicate audit finding', async () => {
    const { service, prisma } = subject({
      stripeCaptures: [{ id: 'pi_existing', status: 'succeeded', amount: 1200 }],
    });
    prisma.auditLog.findFirst.mockResolvedValue({ id: 'existing' });

    await service.reconcile();

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
