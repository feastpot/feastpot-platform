import { AttributionSource, FeastPassStatus } from '@prisma/client';

import type { EmailProvider } from '../modules/notifications/providers/email.provider';
import type { PrismaService } from '../prisma/prisma.service';
import type { StripeService } from '../stripe/stripe.service';

import { FeastPassService } from './feastpass.service';

// Minimal Prisma mock - only the models/methods used by the savings endpoints.
type PrismaMock = {
  feastPassSubscription: { findUnique: jest.Mock };
  order: { aggregate: jest.Mock };
  feastPassSaving: { aggregate: jest.Mock };
};

const makePrisma = (): PrismaMock => ({
  feastPassSubscription: { findUnique: jest.fn() },
  order: { aggregate: jest.fn() },
  feastPassSaving: { aggregate: jest.fn() },
});

const makeService = (prisma: PrismaMock) =>
  new FeastPassService(
    prisma as unknown as PrismaService,
    {} as unknown as StripeService,
    {} as unknown as EmailProvider,
  );

// ---------------------------------------------------------------------------
// getSavingsPotential
// ---------------------------------------------------------------------------

describe('FeastPassService.getSavingsPotential', () => {
  let prisma: PrismaMock;
  let service: FeastPassService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('returns zeros immediately for an active member', async () => {
    prisma.feastPassSubscription.findUnique.mockResolvedValue({
      status: FeastPassStatus.ACTIVE,
    });

    const result = await service.getSavingsPotential('u-1');

    expect(result).toEqual({ savingsPotentialPence: 0, orderCount: 0 });
    // Should not query orders at all - no point aggregating for members
    expect(prisma.order.aggregate).not.toHaveBeenCalled();
  });

  it('sums serviceFeePence for qualifying chargeable orders', async () => {
    prisma.feastPassSubscription.findUnique.mockResolvedValue(null); // non-member
    prisma.order.aggregate.mockResolvedValue({
      _sum: { serviceFeePence: 750 },
      _count: { id: 3 },
    });

    const result = await service.getSavingsPotential('u-2');

    expect(result).toEqual({ savingsPotentialPence: 750, orderCount: 3 });
  });

  it('returns zero savings when all past orders are below service fee threshold', async () => {
    prisma.feastPassSubscription.findUnique.mockResolvedValue(null);
    prisma.order.aggregate.mockResolvedValue({
      _sum: { serviceFeePence: null }, // Prisma returns null when no rows match
      _count: { id: 0 },
    });

    const result = await service.getSavingsPotential('u-3');

    expect(result).toEqual({ savingsPotentialPence: 0, orderCount: 0 });
  });

  it('excludes rejected, cancelled, and refunded orders from the status filter', async () => {
    prisma.feastPassSubscription.findUnique.mockResolvedValue(null);
    prisma.order.aggregate.mockResolvedValue({
      _sum: { serviceFeePence: 0 },
      _count: { id: 0 },
    });

    await service.getSavingsPotential('u-4');

    const call = prisma.order.aggregate.mock.calls[0][0] as {
      where: { status: { in: string[] } };
    };
    const statuses: string[] = call.where.status.in;

    expect(statuses).not.toContain('rejected');
    expect(statuses).not.toContain('cancelled');
    expect(statuses).not.toContain('refunded');
  });

  it('includes all chargeable order statuses in the query', async () => {
    prisma.feastPassSubscription.findUnique.mockResolvedValue(null);
    prisma.order.aggregate.mockResolvedValue({
      _sum: { serviceFeePence: 0 },
      _count: { id: 0 },
    });

    await service.getSavingsPotential('u-5');

    const call = prisma.order.aggregate.mock.calls[0][0] as {
      where: { status: { in: string[] } };
    };
    const statuses: string[] = call.where.status.in;

    for (const s of [
      'pending',
      'accepted',
      'needs_clarification',
      'preparing',
      'ready',
      'dispatched',
      'delivered',
    ]) {
      expect(statuses).toContain(s);
    }
  });

  // ---- DMCC Act compliance: attribution filtering ----

  it('filters orders to only MARKETPLACE_FIRST and MARKETPLACE_REPEAT resolvedSource', async () => {
    prisma.feastPassSubscription.findUnique.mockResolvedValue(null);
    prisma.order.aggregate.mockResolvedValue({
      _sum: { serviceFeePence: 0 },
      _count: { id: 0 },
    });

    await service.getSavingsPotential('u-attr-check');

    const call = prisma.order.aggregate.mock.calls[0][0] as {
      where: { attribution: { resolvedSource: { in: AttributionSource[] } } };
    };

    const allowed: AttributionSource[] = call.where.attribution.resolvedSource.in;
    expect(allowed).toContain(AttributionSource.MARKETPLACE_FIRST);
    expect(allowed).toContain(AttributionSource.MARKETPLACE_REPEAT);
    expect(allowed).not.toContain(AttributionSource.VENDOR_REFERRED);
  });

  it('a member with only vendor-referred orders sees £0 potential savings (aggregate returns 0 after filter)', async () => {
    prisma.feastPassSubscription.findUnique.mockResolvedValue(null);
    // The DB filter excludes VENDOR_REFERRED rows; the aggregate returns nothing.
    prisma.order.aggregate.mockResolvedValue({
      _sum: { serviceFeePence: null },
      _count: { id: 0 },
    });

    const result = await service.getSavingsPotential('u-vendor-only');

    expect(result).toEqual({ savingsPotentialPence: 0, orderCount: 0 });
  });

  it('a mixed history counts only the marketplace-sourced portion', async () => {
    // The DB does the filtering; the mock simulates the post-filter aggregate
    // (only 2 marketplace orders with a combined fee of 500p).
    prisma.feastPassSubscription.findUnique.mockResolvedValue(null);
    prisma.order.aggregate.mockResolvedValue({
      _sum: { serviceFeePence: 500 },
      _count: { id: 2 },
    });

    const result = await service.getSavingsPotential('u-mixed');

    expect(result).toEqual({ savingsPotentialPence: 500, orderCount: 2 });
    // Verify the attribution filter was applied (not just the status filter).
    const call = prisma.order.aggregate.mock.calls[0][0] as {
      where: { attribution: { resolvedSource: { in: AttributionSource[] } } };
    };
    expect(call.where.attribution.resolvedSource.in).not.toContain(AttributionSource.VENDOR_REFERRED);
  });

  it('excludes orders with null/unknown attribution (resolvedSource not in allowlist)', async () => {
    // The `in: [MARKETPLACE_FIRST, MARKETPLACE_REPEAT]` filter automatically
    // excludes rows where resolvedSource IS NULL because Prisma's `in` filter
    // does not match NULL. This test verifies the filter shape does not
    // accidentally include a catch-all that would admit unknown sources.
    prisma.feastPassSubscription.findUnique.mockResolvedValue(null);
    prisma.order.aggregate.mockResolvedValue({
      _sum: { serviceFeePence: 0 },
      _count: { id: 0 },
    });

    await service.getSavingsPotential('u-null-attr');

    const call = prisma.order.aggregate.mock.calls[0][0] as {
      where: { attribution: { resolvedSource: { in: AttributionSource[] } } };
    };

    // Confirm the allowlist contains exactly the two marketplace variants.
    const allowed = call.where.attribution.resolvedSource.in;
    expect(allowed).toHaveLength(2);
    expect(allowed).toEqual(
      expect.arrayContaining([AttributionSource.MARKETPLACE_FIRST, AttributionSource.MARKETPLACE_REPEAT]),
    );
  });
});

// ---------------------------------------------------------------------------
// getMembership savings filtering
// ---------------------------------------------------------------------------

describe('FeastPassService.getMembership savings', () => {
  let prisma: PrismaMock;
  let service: FeastPassService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
    // Default: no subscription
    prisma.feastPassSubscription.findUnique.mockResolvedValue(null);
  });

  function mockSavingsAggregate(savedPence: number | null, count: number) {
    prisma.feastPassSaving.aggregate.mockResolvedValue({
      _sum: { savedPence },
      _count: { id: count },
    });
  }

  it('applies the attribution filter to the FeastPassSaving aggregate', async () => {
    mockSavingsAggregate(800, 2);

    await service.getMembership('u-mem-attr');

    const call = prisma.feastPassSaving.aggregate.mock.calls[0][0] as {
      where: { order: { attribution: { resolvedSource: { in: AttributionSource[] } } } };
    };
    const allowed = call.where.order.attribution.resolvedSource.in;
    expect(allowed).toContain(AttributionSource.MARKETPLACE_FIRST);
    expect(allowed).toContain(AttributionSource.MARKETPLACE_REPEAT);
    expect(allowed).not.toContain(AttributionSource.VENDOR_REFERRED);
  });

  it('returns £0 savings when all past savings rows are from vendor-referred orders (filtered out by DB)', async () => {
    // Simulate the DB filtering out all rows (VENDOR_REFERRED excluded).
    mockSavingsAggregate(null, 0);

    const result = await service.getMembership('u-vendor-savings');

    expect(result.savings).toEqual({ totalSavedPence: 0, orderCount: 0 });
  });

  it('sums only the marketplace-sourced savings rows', async () => {
    // 3 orders total; only 2 are marketplace-sourced (DB filters the rest).
    mockSavingsAggregate(600, 2);

    const result = await service.getMembership('u-mixed-savings');

    expect(result.savings).toEqual({ totalSavedPence: 600, orderCount: 2 });
  });

  it('returns zero when savedPence sum is null (no qualifying savings rows)', async () => {
    mockSavingsAggregate(null, 0);

    const result = await service.getMembership('u-no-savings');

    expect(result.savings.totalSavedPence).toBe(0);
  });
});
