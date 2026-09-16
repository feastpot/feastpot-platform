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
