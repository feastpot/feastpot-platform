import type { PrismaService } from '../../prisma/prisma.service';
import type { EmailProvider } from '../notifications/providers/email.provider';
import type { WhatsappProvider } from '../notifications/providers/whatsapp.provider';
import type { ConfigService } from '@nestjs/config';
import type { NotificationsService } from '../notifications/notifications.service';
import { CateringEnquiriesService } from './catering-enquiries.service';

it('excludes seed vendors and test owners from catering eligibility', async () => {
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
  await service.eligibleVendors('enquiry');
  expect(prisma.vendor.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ isSeedData: false, user: { isTestData: false } }),
    }),
  );
});
