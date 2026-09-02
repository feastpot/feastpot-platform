import { StripeFinancialReconciliationService } from './stripe-financial-reconciliation.service';

describe('StripeFinancialReconciliationService', () => {
  it('durably records every required mismatch class and both amount directions', async () => {
    const prisma: any = {
      payment: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'cap-low', amountPence: 900 })
          .mockResolvedValueOnce({ id: 'cap-high', amountPence: 1100 }),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'ref-low', amountPence: -400 }),
      },
      payout: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'po-low', amountPence: 700 }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'po-no-transfer', stripeTransferId: null, amountPence: 500 }]),
      },
      financialReconciliationFinding: { upsert: jest.fn().mockResolvedValue({}) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const stripe: any = {
      listRecentPaymentIntents: jest.fn().mockResolvedValue({
        data: [
          { id: 'pi-missing', status: 'succeeded', amount_received: 1000, metadata: {} },
          { id: 'pi-local-low', status: 'succeeded', amount_received: 1000, metadata: {} },
          { id: 'pi-local-high', status: 'succeeded', amount_received: 1000, metadata: {} },
        ],
      }),
      listRecentTransfers: jest.fn().mockResolvedValue({
        data: [
          { id: 'tr-missing', amount: 800, metadata: {} },
          { id: 'tr-mismatch', amount: 800, metadata: { payoutId: 'po-low' } },
        ],
      }),
      listRecentRefunds: jest.fn().mockResolvedValue({
        data: [
          { id: 're-missing', amount: 500, status: 'succeeded', payment_intent: 'pi-1' },
          { id: 're-mismatch', amount: 500, status: 'succeeded', payment_intent: 'pi-2' },
        ],
      }),
    };
    const service = new StripeFinancialReconciliationService(prisma, stripe);

    const result = await service.reconcileRecentFinancialActivity(
      new Date('2026-09-02T00:00:00.000Z'),
    );

    expect(result.findings).toBe(8);
    const kinds = prisma.financialReconciliationFinding.upsert.mock.calls.map(
      ([arg]: any[]) => arg.create.kind,
    );
    expect(kinds).toEqual(
      expect.arrayContaining([
        'stripe_capture_missing_local',
        'stripe_transfer_missing_local',
        'local_payout_missing_stripe_transfer',
        'stripe_refund_missing_local',
        'amount_mismatch',
      ]),
    );
    expect(kinds.filter((kind: string) => kind === 'amount_mismatch')).toHaveLength(4);
  });

  it('flags invalid pence bounds and zero fees without provenance', async () => {
    const prisma: any = {
      payment: { findFirst: jest.fn(), findUnique: jest.fn() },
      payout: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      financialReconciliationFinding: { upsert: jest.fn().mockResolvedValue({}) },
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-bad',
            subtotalPence: 1000,
            deliveryFeePence: 0,
            serviceFeePence: 0,
            discountPence: -1,
            commissionPence: 0,
            totalPence: 999,
            vendorPayoutPence: 1200,
            foundingAllowanceAppliedPence: 0,
            feastPassSaving: null,
            attribution: { resolvedSource: 'MARKETPLACE_FIRST' },
            orderCommission: { ratePercent: { toString: () => '12.00' } },
          },
        ]),
      },
    };
    const stripe: any = {
      listRecentPaymentIntents: jest.fn().mockResolvedValue({ data: [] }),
      listRecentTransfers: jest.fn().mockResolvedValue({ data: [] }),
      listRecentRefunds: jest.fn().mockResolvedValue({ data: [] }),
    };
    const service = new StripeFinancialReconciliationService(prisma, stripe);
    const result = await service.reconcileRecentFinancialActivity();
    expect(result.findings).toBe(2);
    const kinds = prisma.financialReconciliationFinding.upsert.mock.calls.map(
      ([arg]: any[]) => arg.create.kind,
    );
    expect(kinds).toEqual(['local_financial_integrity', 'zero_fee_missing_provenance']);
  });
});
