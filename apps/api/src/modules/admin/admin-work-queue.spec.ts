import type { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';

import type { SupabaseService } from '../../auth/supabase.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StripeService } from '../../stripe/stripe.service';
import type { EmailProvider } from '../notifications/providers/email.provider';

import { AdminService } from './admin.service';

const serviceFor = (prisma: object) =>
  new AdminService(
    prisma as PrismaService,
    {} as StripeService,
    {} as SupabaseService,
    {} as EmailProvider,
    {} as ConfigService,
  );

describe('AdminService work queue', () => {
  const emptyPrisma = () => ({
    cateringEnquiry: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    cateringBooking: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    dispute: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    vendorApplication: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    vendorDocument: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    menuItem: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    termsVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    vendor: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    chargeback: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    payout: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    order: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  });

  it('ranks money and food-safety items ahead of operational deadlines', async () => {
    const prisma = emptyPrisma();
    prisma.vendorApplication.findMany.mockResolvedValue([
      {
        id: 'application',
        kitchenName: 'Unsafe Kitchen',
        createdAt: new Date('2025-01-01'),
        hygieneRegNumber: null,
      },
    ]);
    prisma.chargeback.findMany.mockResolvedValue([
      { id: 'chargeback', amountPence: 1000, evidenceDueBy: new Date('2025-01-02') },
    ]);
    prisma.cateringEnquiry.findMany.mockResolvedValue([
      { id: 'enquiry', contactName: 'Ada', createdAt: new Date('2025-01-01') },
    ]);

    const result = await serviceFor(prisma).getWorkQueue(UserRole.admin, []);

    expect(result.items.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'chargeback_evidence_due',
        'vendor_application_missing_fsa',
        'overdue_catering_enquiry',
      ]),
    );
    expect(result.items[0].severity).toBe('critical');
    expect(
      result.items.findIndex((item) => item.type === 'overdue_catering_enquiry'),
    ).toBeGreaterThan(
      result.items.findIndex((item) => item.type === 'vendor_application_missing_fsa'),
    );
  });

  it('does not query or return finance-only work for support', async () => {
    const prisma = emptyPrisma();
    const result = await serviceFor(prisma).getWorkQueue(UserRole.support, []);

    expect(prisma.chargeback.findMany).not.toHaveBeenCalled();
    expect(prisma.payout.findMany).not.toHaveBeenCalled();
    expect(
      result.items.some((item) => item.type.includes('payout') || item.type.includes('chargeback')),
    ).toBe(false);
  });

  it('returns explicit zero action counts and no items when nothing needs action', async () => {
    const result = await serviceFor(emptyPrisma()).getWorkQueue(UserRole.admin, []);

    expect(result.items).toEqual([]);
    expect(Object.values(result.counts).every((count) => count === 0)).toBe(true);
    expect(Object.keys(result.counts).sort()).toEqual([
      'applications',
      'catering',
      'chargebacks',
      'compliance',
      'disputes',
      'jobs',
      'menuModeration',
      'payouts',
      'terms',
    ]);
    expect(result.observedAt).toEqual(expect.any(String));
  });

  it('finds known order, vendor, user and catering entities with bounded output', async () => {
    const prisma = emptyPrisma();
    prisma.order.findMany.mockResolvedValue([{ id: 'order-id', orderNumber: 'FP-100' }]);
    prisma.vendor.findMany.mockResolvedValue([{ id: 'vendor-id', businessName: 'Ada Foods' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'user-id', email: 'ada@example.test' }]);
    prisma.cateringEnquiry.findMany.mockResolvedValue([{ id: 'enquiry-id', contactName: 'Ada' }]);

    const result = await serviceFor(prisma).commandSearch('Ada', UserRole.admin);

    expect(result.results.map((item) => item.type)).toEqual(
      expect.arrayContaining(['order', 'vendor', 'user', 'catering_enquiry']),
    );
    expect(result.results).toHaveLength(4);
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: expect.any(String),
        href: expect.any(String),
      }),
    );
    expect(prisma.order.findMany.mock.calls[0][0].take).toBe(10);
    expect(prisma.order.findMany.mock.calls[0][0].orderBy).toBeDefined();
  });

  it('keeps user email search exclusive to administrators and support', async () => {
    const prisma = emptyPrisma();
    await serviceFor(prisma).commandSearch('ada@example.test', UserRole.finance);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('uses exact counts rather than its bounded display rows and rejects one-character searches', async () => {
    const prisma = emptyPrisma();
    prisma.cateringEnquiry.findMany.mockResolvedValue([
      { id: 'one', contactName: 'Ada', createdAt: new Date('2025-01-01') },
    ]);
    prisma.cateringEnquiry.count.mockResolvedValue(61);
    prisma.cateringBooking.count.mockResolvedValue(2);

    const queue = await serviceFor(prisma).getWorkQueue(UserRole.admin, []);
    await expect(serviceFor(prisma).commandSearch('a', UserRole.admin)).rejects.toThrow(
      'at least 2 characters',
    );

    expect(queue.items).toHaveLength(1);
    expect(queue.counts.catering).toBe(63);
    expect(queue.counts.menuModeration).toBe(0);
  });

  it('reports the exact current-terms action count using the displayed-row filter', async () => {
    const prisma = emptyPrisma();
    prisma.termsVersion.findFirst.mockResolvedValue({ id: 'current-terms' });
    prisma.vendor.findMany.mockResolvedValue([{ id: 'vendor', businessName: 'Ada Foods' }]);
    prisma.vendor.count.mockResolvedValue(73);

    const queue = await serviceFor(prisma).getWorkQueue(UserRole.compliance, []);

    expect(queue.counts.terms).toBe(73);
    expect(queue.items).toEqual([expect.objectContaining({ type: 'vendor_terms_outdated' })]);
    expect(prisma.vendor.findMany.mock.calls[0][0].where).toEqual(
      prisma.vendor.count.mock.calls[0][0].where,
    );
  });
});
