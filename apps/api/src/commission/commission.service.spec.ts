/**
 * CommissionService.calculate() unit tests (D-003).
 *
 * Tests cover:
 *  - dry-run returns `no_change` when stored commission already matches computed
 *  - dry-run returns `would_update` when commission is missing or wrong
 *  - write mode (`dryRun=false`) actually upserts and returns `updated`
 *  - write mode returns `no_change` when already correct
 *  - vendor-funded discount orders: commission basis = subtotal - discount
 *  - platform-funded discount orders: full subtotal is the commission basis
 *  - founding-allowance orders: chargeable basis = max(0, commissionBasis - allowance)
 *  - allowance covering full commission basis → 0p commission
 */
import { Decimal } from '@prisma/client/runtime/library';
import { DiscountFundedBy, OrderSource } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

import { CommissionService } from './commission.service';

// ─── Mock factory ────────────────────────────────────────────────────────────

const RATE_ID = 'rate-marketplace';
const RATE_PCT = new Decimal('12');

function makeService(overrides?: {
  orderSelect?: Record<string, unknown> | null;
  commissionPence?: number | null;
  upsertResult?: Record<string, unknown>;
}) {
  const base = {
    id: 'order-1',
    subtotalPence: 10000,
    deliveryFeePence: 500,
    discountPence: 0,
    discountFundedBy: null,
    foundingAllowanceAppliedPence: 0,
    createdAt: new Date('2026-01-15T12:00:00Z'),
    attribution: { source: OrderSource.MARKETPLACE, isFirstOrder: true },
    orderCommission:
      overrides?.commissionPence != null
        ? { commissionPence: overrides.commissionPence }
        : null,
    ...(overrides?.orderSelect ?? {}),
  };

  const upsert = jest.fn().mockResolvedValue(overrides?.upsertResult ?? { commissionPence: 1200 });

  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(base),
    },
    commissionRate: {
      findFirst: jest.fn().mockResolvedValue({
        id: RATE_ID,
        source: OrderSource.MARKETPLACE,
        isFirstOrder: true,
        ratePercent: RATE_PCT,
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: null,
      }),
    },
    orderCommission: {
      upsert,
    },
  };

  const service = new CommissionService(prisma as never);
  return { service, prisma, upsert };
}

// --- calculate(): dry-run mode ---

describe('CommissionService.calculate() dry-run', () => {
  it('returns no_change when stored commissionPence already matches computed', async () => {
    // subtotal=10000, rate=12%, commissionBasis=10000, computed=1200.
    // Stored commission is already 1200p → no_change.
    const { service } = makeService({ commissionPence: 1200 });
    const result = await service.calculate('order-1'); // dryRun=true by default
    expect(result).toMatchObject({
      orderId: 'order-1',
      action: 'no_change',
      currentCommissionPence: 1200,
      computedCommissionPence: 1200,
      dryRun: true,
    });
  });

  it('returns would_update when no OrderCommission row exists (null current)', async () => {
    const { service } = makeService({ commissionPence: null });
    const result = await service.calculate('order-1');
    expect(result).toMatchObject({
      action: 'would_update',
      currentCommissionPence: null,
      computedCommissionPence: 1200,
      dryRun: true,
    });
  });

  it('returns would_update when stored commission is wrong', async () => {
    // Stored as 999 (corrupted); computed = 1200.
    const { service } = makeService({ commissionPence: 999 });
    const result = await service.calculate('order-1');
    expect(result).toMatchObject({
      action: 'would_update',
      currentCommissionPence: 999,
      computedCommissionPence: 1200,
    });
  });

  it('does NOT write to the DB in dry-run mode', async () => {
    const { service, upsert } = makeService({ commissionPence: 999 });
    await service.calculate('order-1'); // dryRun=true by default
    expect(upsert).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the order does not exist', async () => {
    const { service, prisma } = makeService();
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.calculate('no-such-order')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// --- calculate(): write mode ---

describe('CommissionService.calculate() write mode', () => {
  it('upserts and returns updated when stored commission is wrong', async () => {
    const { service, upsert } = makeService({ commissionPence: 999 });
    const result = await service.calculate('order-1', false); // explicit write
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'order-1' },
        create: expect.objectContaining({ commissionPence: 1200 }),
        update: expect.objectContaining({ commissionPence: 1200 }),
      }),
    );
    expect(result).toMatchObject({ action: 'updated', dryRun: false });
  });

  it('upserts and returns no_change when commission is already correct', async () => {
    const { service, upsert } = makeService({ commissionPence: 1200 });
    const result = await service.calculate('order-1', false);
    expect(upsert).toHaveBeenCalled();
    expect(result).toMatchObject({ action: 'no_change', dryRun: false });
  });
});

// --- calculate(): discount and allowance variants ---

describe('CommissionService.calculate() formula variants', () => {
  it('VENDOR-funded discount: commission basis = subtotal - discount', async () => {
    // subtotal=10000, vendor-funded discount=2000 → basis=8000 → commission=960
    const { service } = makeService({
      orderSelect: {
        subtotalPence: 10000,
        discountPence: 2000,
        discountFundedBy: DiscountFundedBy.VENDOR,
        foundingAllowanceAppliedPence: 0,
      },
      commissionPence: null,
    });
    const result = await service.calculate('order-1');
    expect(result.computedCommissionPence).toBe(960); // round(8000 * 12/100) = 960
    expect(result.action).toBe('would_update');
  });

  it('PLATFORM-funded discount: commission basis = full subtotal (vendor protected)', async () => {
    // subtotal=10000, platform-funded discount=2000 → basis=10000 → commission=1200
    // Platform absorbs the discount from its margin; vendor gets full commission credit.
    const { service } = makeService({
      orderSelect: {
        subtotalPence: 10000,
        discountPence: 2000,
        discountFundedBy: DiscountFundedBy.PLATFORM,
        foundingAllowanceAppliedPence: 0,
      },
      commissionPence: null,
    });
    const result = await service.calculate('order-1');
    expect(result.computedCommissionPence).toBe(1200); // full subtotal, not reduced
  });

  it('founding-allowance order: chargeable basis = max(0, commissionBasis - allowance)', async () => {
    // subtotal=10000, allowance=3000 → chargeable=7000 → commission=840
    const { service } = makeService({
      orderSelect: {
        subtotalPence: 10000,
        discountPence: 0,
        discountFundedBy: null,
        foundingAllowanceAppliedPence: 3000,
      },
      commissionPence: null,
    });
    const result = await service.calculate('order-1');
    expect(result.computedCommissionPence).toBe(840); // round(7000 * 12/100) = 840
  });

  it('allowance covering full commission basis → 0p commission', async () => {
    // subtotal=5000, allowance=5000 → chargeable=0 → commission=0
    const { service } = makeService({
      orderSelect: {
        subtotalPence: 5000,
        discountPence: 0,
        discountFundedBy: null,
        foundingAllowanceAppliedPence: 5000,
      },
      commissionPence: 120, // was 120p; should be 0p after correction
    });
    const result = await service.calculate('order-1');
    expect(result.computedCommissionPence).toBe(0);
    expect(result.action).toBe('would_update');
  });

  it('allowance + VENDOR-funded discount: allowance applied AFTER discount reduction', async () => {
    // commissionBasis = max(0, subtotal - discount) = max(0, 10000 - 2000) = 8000
    // chargeable = max(0, 8000 - 3000) = 5000
    // commission = round(5000 * 12/100) = 600
    const { service } = makeService({
      orderSelect: {
        subtotalPence: 10000,
        discountPence: 2000,
        discountFundedBy: DiscountFundedBy.VENDOR,
        foundingAllowanceAppliedPence: 3000,
      },
      commissionPence: null,
    });
    const result = await service.calculate('order-1');
    expect(result.computedCommissionPence).toBe(600);
  });
});
