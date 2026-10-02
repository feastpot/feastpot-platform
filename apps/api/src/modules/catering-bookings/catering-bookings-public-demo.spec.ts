import { ForbiddenException } from '@nestjs/common';

import type { AuthUser } from '../../auth/types';
import type { CommissionService } from '../../commission/commission.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StripeService } from '../../stripe/stripe.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailProvider } from '../notifications/providers/email.provider';
import type { PaymentsService } from '../payments/payments.service';

import { CateringBookingsService } from './catering-bookings.service';

describe('CateringBookingsService read-only demo guards', () => {
  const originalEnv = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('rejects public demo quote creation even in the test environment before commission or writes', async () => {
    process.env.NODE_ENV = 'test';
    const prisma: any = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'demo-vendor',
          businessName: 'Demo',
          slug: 'demo',
          stripeAccountId: null,
          publicDemo: true,
          isSeedData: false,
          user: { isTestData: true },
        }),
      },
      cateringBooking: { create: jest.fn() },
    };
    const commission = { resolveRateAndCompute: jest.fn() };
    const service = new CateringBookingsService(
      prisma as PrismaService,
      {} as StripeService,
      {} as NotificationsService,
      {} as EmailProvider,
      commission as unknown as CommissionService,
      {} as PaymentsService,
    );

    await expect(
      service.createQuote({ id: 'owner', email: 'owner@example.com', role: 'vendor' } as AuthUser, {} as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(commission.resolveRateAndCompute).not.toHaveBeenCalled();
    expect(prisma.cateringBooking.create).not.toHaveBeenCalled();
  });
});