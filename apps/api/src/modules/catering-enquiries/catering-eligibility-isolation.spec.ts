import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailProvider } from '../notifications/providers/email.provider';
import type { WhatsappProvider } from '../notifications/providers/whatsapp.provider';

import { CateringEnquiriesService } from './catering-enquiries.service';

const originalNodeEnv = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

function harness() {
  const prisma: any = {
    cateringEnquiry: {
      findUnique: jest.fn().mockResolvedValue({ outwardCode: 'SE15', postcode: 'SE15 4ST' }),
    },
    vendor: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new CateringEnquiriesService(
    prisma as PrismaService,
    {} as EmailProvider,
    {} as WhatsappProvider,
    {} as ConfigService,
    {} as NotificationsService,
  );
  return { prisma, service };
}

it('excludes seed vendors and test owners from catering eligibility outside tests', async () => {
  process.env.NODE_ENV = 'production';
  const { prisma, service } = harness();
  await service.eligibleVendors('enquiry');
  expect(prisma.vendor.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ isSeedData: false, user: { isTestData: false } }),
    }),
  );
});

it('allows isolated test-environment fixtures into catering eligibility', async () => {
  process.env.NODE_ENV = 'test';
  const { prisma, service } = harness();
  await service.eligibleVendors('enquiry');
  expect(prisma.vendor.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.not.objectContaining({
        isSeedData: expect.anything(),
        user: expect.anything(),
      }),
    }),
  );
});

describe('catering assignment isolation', () => {
  const originalEnv = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  const makeAssignmentHarness = (
    operation: 'assign' | 'reassign',
    vendor: Record<string, unknown>,
  ) => {
    process.env.NODE_ENV = 'production';
    const prisma: any = {
      cateringEnquiry: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'enquiry-1',
          status: operation === 'assign' ? 'NEW' : 'ASSIGNED',
          outwardCode: 'SE15',
          postcode: 'SE15 4ST',
          eventDate: null,
          email: 'customer@example.com',
          contactName: 'Customer',
          guestCountBand: '10-20',
          preferredTime: null,
          cuisineStyle: null,
          isTestData: false,
          provenance: null,
        }),
      },
      cateringBooking: {
        findUnique: jest.fn().mockResolvedValue(
          operation === 'assign'
            ? null
            : {
                id: 'booking-1',
                status: 'ASSIGNED',
                vendorId: 'old-vendor',
                vendor: { userId: 'old-owner', businessName: 'Old vendor' },
              },
        ),
      },
      vendor: { findUnique: jest.fn().mockResolvedValue(vendor) },
      $transaction: jest.fn(),
    };
    const service = new CateringEnquiriesService(
      prisma as PrismaService,
      {} as EmailProvider,
      {} as WhatsappProvider,
      {} as ConfigService,
      {} as NotificationsService,
    );
    return { prisma, service };
  };

  it.each([
    ['public demo', { publicDemo: true, isSeedData: false, user: { isTestData: true } }],
    ['persisted fixture', { publicDemo: false, isSeedData: true, user: { isTestData: false } }],
  ])('rejects %s before assignment and reassignment writes', async (_label, provenance) => {
    const vendor = {
      id: 'vendor-1',
      businessName: 'Demo Kitchen',
      userId: 'owner-1',
      status: 'live',
      eventCateringManualQuote: true,
      deliveryConfig: { postcodes: [] },
      ...provenance,
    };
    const assign = makeAssignmentHarness('assign', vendor);
    await expect(
      assign.service.assignEnquiry('enquiry-1', { vendorId: 'vendor-1' } as never, 'admin'),
    ).rejects.toMatchObject({
      response: { code: 'VENDOR_NOT_AVAILABLE_FOR_CATERING' },
    });
    expect(assign.prisma.$transaction).not.toHaveBeenCalled();

    const reassign = makeAssignmentHarness('reassign', vendor);
    await expect(
      reassign.service.reassignEnquiry('enquiry-1', { vendorId: 'vendor-1' } as never, 'admin'),
    ).rejects.toMatchObject({
      response: { code: 'VENDOR_NOT_AVAILABLE_FOR_CATERING' },
    });
    expect(reassign.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('never lists public demos as catering-eligible, including under NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    const { prisma, service } = harness();
    await service.eligibleVendors('enquiry');
    expect(prisma.vendor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ publicDemo: false }),
      }),
    );
  });
});
