import { BadRequestException } from '@nestjs/common';
import { DiscountFundedBy, OrderSource, RateStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { CommissionService } from './commission/commission.service';
import {
  computeIncrementalRefundSplit,
  computeRefundSplit,
  type RefundOrderEconomics,
} from './modules/payments/payments.service';
import {
  buildPayoutStatement,
  type PayoutStatementEntryInput,
} from './modules/payouts/payout-statement';

const ORDERED_AT = new Date('2026-01-15T12:00:00.000Z');

function commissionService(ratePercent: string, options?: { planned?: boolean }) {
  const prisma = {
    commissionRate: {
      findFirst: jest.fn().mockResolvedValue({
        id: `rate-${ratePercent}`,
        source: OrderSource.MARKETPLACE,
        isFirstOrder: true,
        ratePercent: new Decimal(ratePercent),
        rateKey: options?.planned ? 'planned-rate' : null,
      }),
    },
    rateScheduleEntry: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options?.planned ? { status: RateStatus.PLANNED } : null),
    },
  };
  return { service: new CommissionService(prisma as never), prisma };
}

const refundEconomics: RefundOrderEconomics = {
  subtotalPence: 10_000,
  serviceFeePence: 800,
  deliveryFeePence: 500,
  discountPence: 0,
  commissionPence: 1_200,
};
const orderTotalPence = 11_300;

function incrementalSequence(refundsPence: number[]) {
  let refundedPence = 0;
  return refundsPence.map((refundPence) => {
    const split = computeIncrementalRefundSplit(
      refundedPence,
      refundPence,
      refundEconomics,
      orderTotalPence,
    );
    refundedPence += refundPence;
    return split;
  });
}

function statementEntry(
  overrides: Partial<PayoutStatementEntryInput> = {},
): PayoutStatementEntryInput {
  return {
    id: 'order-1',
    kind: 'order',
    reference: 'FP-001',
    occurredAt: '2026-01-15T12:00:00.000Z',
    source: 'MARKETPLACE_FIRST',
    effectiveCommissionRatePercent: '12.00',
    grossPence: 11_300,
    foodSubtotalPence: 10_000,
    commissionPence: 1_200,
    serviceFeesPence: 800,
    refundsPence: 0,
    chargebacksPence: 0,
    vendorPayoutBeforeDeductionsPence: 9_300,
    ...overrides,
  };
}

function payoutStatement(entries: PayoutStatementEntryInput[]) {
  return buildPayoutStatement({
    vendorId: 'vendor-1',
    vendorBusinessName: 'Pence Kitchen',
    periodStart: new Date('2026-01-12T00:00:00.000Z'),
    periodEnd: new Date('2026-01-19T00:00:00.000Z'),
    hasOpenDispute: false,
    entries,
  });
}

describe('integer-pence financial permutation suite: commission', () => {
  it.each<[string, OrderSource, boolean, string, number]>([
    ['marketplace first order', OrderSource.MARKETPLACE, true, '12', 1_200],
    ['marketplace repeat order with the same vendor', OrderSource.MARKETPLACE, false, '10', 1_000],
    ['vendor-referred order at the schedule minimum', OrderSource.VENDOR_REFERRED, true, '0', 0],
    ['vendor-referred order at the schedule maximum', OrderSource.VENDOR_REFERRED, true, '3', 300],
    [
      'same customer at a different vendor is a first marketplace order',
      OrderSource.MARKETPLACE,
      true,
      '12',
      1_200,
    ],
    [
      'cross-vendor referral is marketplace for the receiving vendor',
      OrderSource.MARKETPLACE,
      true,
      '12',
      1_200,
    ],
  ])(
    '%s uses the scheduled rate in integer pence',
    async (_name, source, first, rate, expected) => {
      const { service } = commissionService(rate);
      const result = await service.resolveRateAndCompute(
        source,
        first,
        10_000,
        500,
        800,
        0,
        null,
        ORDERED_AT,
      );
      expect(result.commissionPence).toBe(expected);
    },
  );

  it('applies the founding-cook allowance as a zero-pence commission until £1,000 GMV is exhausted', () => {
    const { service } = commissionService('12');
    expect(service.computePence(0, new Decimal('12'))).toBe(0);
    expect(service.computePence(100_000, new Decimal('12'))).toBe(12_000);
  });

  it('keeps the order-time rate when a later refund is calculated', () => {
    const originalCommissionPence = 1_200;
    const originalRate = commissionService('12').service.computePence(10_000, new Decimal('12'));
    const laterRate = commissionService('10').service.computePence(10_000, new Decimal('10'));
    const split = computeRefundSplit(
      orderTotalPence,
      { ...refundEconomics, commissionPence: originalCommissionPence },
      true,
    );
    expect(originalRate).toBe(originalCommissionPence);
    expect(laterRate).toBe(1_000);
    expect(split.commissionRefundedPence).toBe(originalCommissionPence);
  });

  it('never charges commission on delivery, service fee, tips, or a platform-funded discount', async () => {
    const { service } = commissionService('12');
    const baseline = await service.resolveRateAndCompute(
      OrderSource.MARKETPLACE,
      true,
      10_000,
      0,
      0,
      0,
      null,
      ORDERED_AT,
    );
    const delivery = await service.resolveRateAndCompute(
      OrderSource.MARKETPLACE,
      true,
      10_000,
      5_000,
      0,
      0,
      null,
      ORDERED_AT,
    );
    const serviceFee = await service.resolveRateAndCompute(
      OrderSource.MARKETPLACE,
      true,
      10_000,
      0,
      5_000,
      0,
      null,
      ORDERED_AT,
    );
    const platformDiscount = await service.resolveRateAndCompute(
      OrderSource.MARKETPLACE,
      true,
      10_000,
      0,
      0,
      2_000,
      DiscountFundedBy.PLATFORM,
      ORDERED_AT,
    );
    // Tips are not an input to the commission helper, so only its food subtotal is chargeable.
    const tip = service.computePence(10_000, new Decimal('12'));

    expect(baseline.commissionPence).toBe(1_200);
    expect(delivery.commissionPence).toBe(1_200);
    expect(serviceFee.commissionPence).toBe(1_200);
    expect(platformDiscount.commissionPence).toBe(1_200);
    expect(tip).toBe(1_200);
  });

  it('rejects a planned rate before it can produce a pence calculation', async () => {
    const { service } = commissionService('12', { planned: true });
    await expect(
      service.resolveRateAndCompute(
        OrderSource.MARKETPLACE,
        true,
        10_000,
        500,
        800,
        0,
        null,
        ORDERED_AT,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('integer-pence financial permutation suite: refund sequences', () => {
  it('handles full refunds, a single partial, and partials below the total', () => {
    const full = computeRefundSplit(orderTotalPence, refundEconomics, true);
    const [singlePartial] = incrementalSequence([5_000]);
    const belowTotal = incrementalSequence([3_000, 2_000]);

    expect(full.vendorClawbackPence).toBe(9_300);
    expect(full.feastpotAbsorbedPence).toBe(2_000);
    expect(singlePartial.vendorClawbackPence).toBe(4_650);
    expect(singlePartial.feastpotAbsorbedPence).toBe(350);
    expect(belowTotal.reduce((sum, split) => sum + split.vendorClawbackPence, 0)).toBe(4_650);
    expect(belowTotal.reduce((sum, split) => sum + split.feastpotAbsorbedPence, 0)).toBe(350);
  });

  it('makes two partial refunds summing to the total exactly equal a single full refund', () => {
    const [first, final] = incrementalSequence([5_000, 6_300]);
    expect(first.vendorClawbackPence + final.vendorClawbackPence).toBe(9_300);
    expect(first.feastpotAbsorbedPence + final.feastpotAbsorbedPence).toBe(2_000);
    expect(first.vendorClawbackPence + first.feastpotAbsorbedPence).toBe(5_000);
    expect(final.vendorClawbackPence + final.feastpotAbsorbedPence).toBe(6_300);
  });

  it('identifies a third refund that exceeds the remaining integer-pence balance', () => {
    const alreadyRefundedPence = 8_000;
    const requestedPence = 3_301;
    expect(alreadyRefundedPence + requestedPence).toBeGreaterThan(orderTotalPence);
    expect(orderTotalPence - alreadyRefundedPence).toBe(3_300);
  });

  it('keeps FeastPass refunds correctly split when the service fee is waived', () => {
    const feastPass = computeRefundSplit(10_500, { ...refundEconomics, serviceFeePence: 0 }, true);
    expect(feastPass.vendorClawbackPence).toBe(9_300);
    expect(feastPass.feastpotAbsorbedPence).toBe(1_200);
    expect(feastPass.commissionRefundedPence).toBe(1_200);
    expect(feastPass.serviceFeeAbsorbedPence).toBe(0);
  });
});

describe('integer-pence financial permutation suite: payout statements', () => {
  it('includes a partially refunded order in both detail and batch totals', () => {
    const result = payoutStatement([statementEntry({ refundsPence: 4_650 })]);
    expect(result.entries[0].refundsPence).toBe(4_650);
    expect(result.entries[0].netPence).toBe(4_650);
    expect(result.summary.refundsPence).toBe(4_650);
    expect(result.summary.netPayoutPence).toBe(4_650);
  });

  it.each<[string, PayoutStatementEntryInput[], number]>([
    ['delivered orders only', [statementEntry()], 9_300],
    [
      'a batch spanning rates',
      [
        statementEntry(),
        statementEntry({
          id: 'order-2',
          reference: 'FP-002',
          effectiveCommissionRatePercent: '10.00',
          commissionPence: 1_000,
          vendorPayoutBeforeDeductionsPence: 9_500,
        }),
      ],
      18_800,
    ],
    [
      'a catering booking',
      [
        statementEntry({
          id: 'booking-1',
          kind: 'catering',
          grossPence: 50_000,
          foodSubtotalPence: 50_000,
          commissionPence: 5_000,
          serviceFeesPence: 0,
          vendorPayoutBeforeDeductionsPence: 45_000,
        }),
      ],
      45_000,
    ],
    ['a zero-net batch', [statementEntry({ refundsPence: 9_300 })], 0],
    ['a negative batch carried forward', [statementEntry({ refundsPence: 10_000 })], -700],
    ['a vendor with no qualifying orders', [], 0],
  ])('%s retains exact pence', (_name, entries, expectedNetPence) => {
    const result = payoutStatement(entries);
    expect(result.summary.netPayoutPence).toBe(expectedNetPence);
    expect(result.summary.entryCount).toBe(entries.length);
  });
});
