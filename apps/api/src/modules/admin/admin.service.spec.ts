import type { ConfigService } from '@nestjs/config';

import type { SupabaseService } from '../../auth/supabase.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StripeService } from '../../stripe/stripe.service';
import type { EmailProvider } from '../notifications/providers/email.provider';

import { AdminService } from './admin.service';

describe('AdminService operational dashboard provenance', () => {
  it('excludes persisted test vendors and orders by default, and carries the explicit include flag to counts', async () => {
    const prisma = {
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
      vendor: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      {} as StripeService,
      {} as SupabaseService,
      {} as EmailProvider,
      {} as ConfigService,
    );

    await service.listAdminVendors({});
    await service.getVendorStatusCounts();
    await service.getVendorStatusCounts(true);
    await service.listAdminOrders({});

    expect(prisma.vendor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ isSeedData: false, user: { isTestData: false } }),
          ]),
        }),
      }),
    );
    expect(prisma.vendor.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { isSeedData: false, user: { isTestData: false } } }),
    );
    expect(prisma.vendor.groupBy).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: {} }));
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isSeedData: false,
          customer: { isTestData: false },
          vendor: { isSeedData: false, user: { isTestData: false } },
        }),
      }),
    );
  });

  it('excludes explicitly marked seed orders/vendors and test users from every order metric', async () => {
    const prisma = {
      order: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalPence: 0, subtotalPence: 0 },
          _avg: { totalPence: 0 },
          _count: { _all: 0 },
        }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      vendor: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      {} as StripeService,
      {} as SupabaseService,
      {} as EmailProvider,
      {} as ConfigService,
    );

    await service.getDashboard();

    const operationalScope = {
      isSeedData: false,
      customer: { isTestData: false },
      vendor: { isSeedData: false, user: { isTestData: false } },
    };
    for (const [args] of [
      ...prisma.order.aggregate.mock.calls,
      ...prisma.order.count.mock.calls,
      ...prisma.order.findMany.mock.calls,
    ]) {
      expect(args.where).toEqual(expect.objectContaining(operationalScope));
    }
    expect(prisma.vendor.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isSeedData: false,
        user: { isTestData: false },
      }),
    });
  });

  it('labels explicit test-data provenance in audit CSV exports', async () => {
    const prisma = {
      auditLog: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'audit-1',
              createdAt: new Date('2030-01-02T03:04:05.000Z'),
              action: 'test.action',
              entityType: 'orders',
              entityId: 'order-1',
              ipAddress: null,
              metadata: null,
              isTestData: true,
              provenance: 'test-factory',
              actor: {
                firstName: 'Fixture',
                lastName: 'Actor',
                email: 'fixture@example.test',
                role: 'admin',
              },
            },
          ])
          .mockResolvedValueOnce([]),
      },
    };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      {} as StripeService,
      {} as SupabaseService,
      {} as EmailProvider,
      {} as ConfigService,
    );
    const chunks: string[] = [];

    await service.exportAuditLogCsv({ includeTestData: true }, (chunk) => chunks.push(chunk));

    expect(chunks[0]).toContain('is_test_data,provenance\n');
    expect(chunks[1]).toBe(
      '2030-01-02T03:04:05.000Z,fixture@example.test,admin,Fixture Actor,test.action,orders,order-1,,,true,test-factory\n',
    );
  });
});
