import {
  applyPayoutCarryForward,
  buildPayoutStatement,
  type PayoutStatementEntryInput,
} from './payout-statement';

const baseEntry = (
  overrides: Partial<PayoutStatementEntryInput> = {},
): PayoutStatementEntryInput => ({
  id: 'order-1',
  kind: 'order',
  reference: 'FP-001',
  occurredAt: '2026-08-25T12:00:00.000Z',
  source: 'MARKETPLACE_FIRST',
  effectiveCommissionRatePercent: '12.00',
  grossPence: 4_449,
  foodSubtotalPence: 4_000,
  commissionPence: 480,
  serviceFeesPence: 200,
  refundsPence: 0,
  chargebacksPence: 0,
  vendorPayoutBeforeDeductionsPence: 3_769,
  ...overrides,
});

describe('payout carry-forward', () => {
  it.each([
    ['new debt', 0, -231, 0, -231],
    ['debt grows', -231, -100, 0, -331],
    ['earnings partly repay debt', -500, 300, 0, -200],
    ['earnings clear debt exactly', -500, 500, 0, 0],
    ['earnings clear debt and transfer remainder', -500, 800, 300, 0],
  ])(
    '%s keeps Stripe amount non-negative and preserves the balance equation',
    (_name, opening, rawNet, transferable, closing) => {
      const base = statement([
        baseEntry({
          vendorPayoutBeforeDeductionsPence: rawNet,
          refundsPence: 0,
          chargebacksPence: 0,
        }),
      ]);
      const result = applyPayoutCarryForward(base, opening);
      expect(result.summary.openingBalancePence).toBe(opening);
      expect(result.summary.rawNetPayoutPence).toBe(rawNet);
      expect(result.summary.netPayoutPence).toBe(transferable);
      expect(result.summary.closingBalancePence).toBe(closing);
      expect(opening + rawNet).toBe(transferable + closing);
    },
  );
});

const statement = (entries: PayoutStatementEntryInput[]) =>
  buildPayoutStatement({
    vendorId: 'vendor-1',
    vendorBusinessName: 'Test Kitchen',
    periodStart: new Date('2026-08-24T00:00:00.000Z'),
    periodEnd: new Date('2026-08-31T00:00:00.000Z'),
    hasOpenDispute: false,
    entries,
  });

function expectReconciled(entries: PayoutStatementEntryInput[]) {
  const result = statement(entries);
  expect(result.entries).toHaveLength(entries.length);
  expect(result.summary.entryCount).toBe(entries.length);
  expect(result.summary.netPayoutPence).toBe(
    result.entries.reduce((sum, entry) => sum + entry.netPence, 0),
  );
  expect(
    result.summary.grossSalesPence -
      result.summary.commissionPence -
      result.summary.refundsPence -
      result.summary.chargebacksPence -
      (result.summary.serviceFeesPence ?? 0) +
      (result.summary.adjustmentsPence ?? 0),
  ).toBe(result.summary.netPayoutPence);
  return result;
}

describe('canonical payout statement permutation matrix', () => {
  it.each([
    ['single delivered order', [baseEntry()]],
    [
      'mixed marketplace and referred orders',
      [
        baseEntry(),
        baseEntry({
          id: 'order-2',
          reference: 'FP-002',
          source: 'VENDOR_REFERRED',
          effectiveCommissionRatePercent: '0.00',
          commissionPence: 0,
          vendorPayoutBeforeDeductionsPence: 4_249,
        }),
      ],
    ],
    ['one partial refund', [baseEntry({ refundsPence: 900 })]],
    [
      'two partial refunds represented by their cumulative ledger effect',
      [baseEntry({ refundsPence: 1_800 })],
    ],
    ['fully refunded order', [baseEntry({ refundsPence: 3_769 })]],
    ['chargeback raised', [baseEntry({ chargebacksPence: 1_200 })]],
    [
      'chargeback lost after a partial refund',
      [baseEntry({ refundsPence: 800, chargebacksPence: 2_969 })],
    ],
    ['FeastPass order', [baseEntry({ grossPence: 4_249, serviceFeesPence: 0 })]],
    [
      'catering booking in the same batch',
      [
        baseEntry(),
        baseEntry({
          id: 'booking-1',
          kind: 'catering',
          reference: 'CATERING-00000001',
          grossPence: 50_000,
          foodSubtotalPence: 50_000,
          commissionPence: 5_000,
          serviceFeesPence: 0,
          vendorPayoutBeforeDeductionsPence: 45_000,
          effectiveCommissionRatePercent: '10.00',
        }),
      ],
    ],
    [
      'batch spanning a rate change',
      [
        baseEntry({ effectiveCommissionRatePercent: '12.00' }),
        baseEntry({
          id: 'order-2',
          reference: 'FP-002',
          effectiveCommissionRatePercent: '10.00',
          commissionPence: 400,
          vendorPayoutBeforeDeductionsPence: 3_849,
        }),
      ],
    ],
    ['empty batch', []],
    ['zero net batch', [baseEntry({ refundsPence: 3_769 })]],
    ['negative net batch', [baseEntry({ refundsPence: 4_000 })]],
  ])('%s reconciles to the penny', (_name, entries) => {
    expectReconciled(entries);
  });

  it('preserves the effective rate actually stored on each entry', () => {
    const result = statement([
      baseEntry({ effectiveCommissionRatePercent: '12.00' }),
      baseEntry({
        id: 'order-2',
        effectiveCommissionRatePercent: '3.00',
        commissionPence: 120,
        vendorPayoutBeforeDeductionsPence: 4_129,
      }),
    ]);
    expect(result.entries.map((entry) => entry.effectiveCommissionRatePercent)).toEqual([
      '12.00',
      '3.00',
    ]);
  });

  it.each([
    [
      'all first-order',
      [baseEntry({ effectiveCommissionRatePercent: '8.00', commissionPence: 320 })],
      '8.00',
    ],
    [
      'all repeat',
      [
        baseEntry({
          source: 'MARKETPLACE_REPEAT',
          effectiveCommissionRatePercent: '5.00',
          commissionPence: 200,
        }),
      ],
      '5.00',
    ],
    [
      'all referred',
      [
        baseEntry({
          source: 'VENDOR_REFERRED',
          effectiveCommissionRatePercent: '0.00',
          commissionPence: 0,
        }),
      ],
      '0.00',
    ],
    [
      'mixed source',
      [
        baseEntry({ effectiveCommissionRatePercent: '8.00', commissionPence: 320 }),
        baseEntry({
          id: 'order-2',
          source: 'MARKETPLACE_REPEAT',
          effectiveCommissionRatePercent: '5.00',
          commissionPence: 200,
        }),
        baseEntry({
          id: 'order-3',
          source: 'VENDOR_REFERRED',
          effectiveCommissionRatePercent: '0.00',
          commissionPence: 0,
        }),
      ],
      '4.33',
    ],
  ])('%s batch stores its effective blended rate', (_label, entries, expected) => {
    expect(statement(entries).summary.effectiveBlendedRatePercent).toBe(expected);
  });

  it('stores every distinct applied source and rate for downstream formats', () => {
    const result = statement([
      baseEntry({ effectiveCommissionRatePercent: '8.00', commissionPence: 320 }),
      baseEntry({
        id: 'order-2',
        source: 'MARKETPLACE_REPEAT',
        effectiveCommissionRatePercent: '5.00',
        commissionPence: 200,
      }),
      baseEntry({
        id: 'booking-1',
        kind: 'catering',
        source: 'CATERING',
        effectiveCommissionRatePercent: '10.00',
        commissionPence: 400,
      }),
    ]);

    expect(result.appliedCommissionRates).toEqual([
      { source: 'MARKETPLACE_FIRST', effectiveCommissionRatePercent: '8.00' },
      { source: 'MARKETPLACE_REPEAT', effectiveCommissionRatePercent: '5.00' },
      { source: 'CATERING', effectiveCommissionRatePercent: '10.00' },
    ]);
  });

  it('serializes the current 8/5/0/10 schedule per entry, preserving a clean zero rate', () => {
    const result = statement([
      baseEntry({ source: 'MARKETPLACE_FIRST', effectiveCommissionRatePercent: '8.00' }),
      baseEntry({
        id: 'repeat',
        source: 'MARKETPLACE_REPEAT',
        effectiveCommissionRatePercent: '5.00',
        commissionPence: 200,
      }),
      baseEntry({
        id: 'referred',
        source: 'VENDOR_REFERRED',
        effectiveCommissionRatePercent: '0.00',
        commissionPence: 0,
      }),
      baseEntry({
        id: 'catering',
        kind: 'catering',
        source: 'CATERING',
        effectiveCommissionRatePercent: '10.00',
        commissionPence: 400,
      }),
    ]);

    expect(result.entries.map((entry) => entry.effectiveCommissionRatePercent)).toEqual([
      '8.00',
      '5.00',
      '0.00',
      '10.00',
    ]);
    expect(result.appliedCommissionRates).toEqual([
      { source: 'MARKETPLACE_FIRST', effectiveCommissionRatePercent: '8.00' },
      { source: 'MARKETPLACE_REPEAT', effectiveCommissionRatePercent: '5.00' },
      { source: 'VENDOR_REFERRED', effectiveCommissionRatePercent: '0.00' },
      { source: 'CATERING', effectiveCommissionRatePercent: '10.00' },
    ]);
  });

  it('marks unavailable amounts as unavailable rather than zero', () => {
    const result = statement([baseEntry({ serviceFeesPence: null })]);
    expect(result.summary.serviceFeesPence).toBeNull();
    expect(result.summary.adjustmentsPence).toBeNull();
  });

  it('marks the blended rate unavailable when there is no commission basis', () => {
    const result = statement([]);
    expect(result.summary.effectiveBlendedRatePercent).toBeNull();
  });
});
