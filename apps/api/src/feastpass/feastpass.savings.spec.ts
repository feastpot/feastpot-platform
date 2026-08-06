import { FeastPassStatus } from '@prisma/client';

import type { EmailProvider } from '../modules/notifications/providers/email.provider';
import type { PrismaService } from '../prisma/prisma.service';
import type { StripeService } from '../stripe/stripe.service';

import { FeastPassService } from './feastpass.service';

// Minimal Prisma mock — only the models/methods used by getSavingsPotential.
type PrismaMock = {
  feastPassSubscription: { findUnique: jest.Mock };
  order: { aggregate: jest.Mock };
};

const makePrisma = (): PrismaMock => ({
  feastPassSubscription: { findUnique: jest.fn() },
  order: { aggregate: jest.fn() },
});

const makeService = (prisma: PrismaMock) =>
  new FeastPassService(
    prisma as unknown as PrismaService,
    {} as unknown as StripeService,
    {} as unknown as EmailProvider,
  );

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
    // Should not query orders at all — no point aggregating for members
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
});
