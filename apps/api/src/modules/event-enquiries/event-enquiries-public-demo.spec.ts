import { ForbiddenException } from '@nestjs/common';

import type { AuthUser } from '../../auth/types';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StripeService } from '../../stripe/stripe.service';
import type { NotificationsService } from '../notifications/notifications.service';

import { EventEnquiriesService } from './event-enquiries.service';

describe('event quote provenance guard', () => {
  const originalEnv = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it.each([
    [
      'public demos in tests',
      'test',
      { publicDemo: true, isSeedData: false, user: { isTestData: true } },
    ],
    [
      'persisted fixture vendors outside tests',
      'production',
      { publicDemo: false, isSeedData: true, user: { isTestData: false } },
    ],
  ])('rejects %s before reading the enquiry or creating a quote', async (_case, env, markers) => {
    process.env.NODE_ENV = env;
    const prisma: any = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({ id: 'vendor-1', ...markers }),
      },
      eventEnquiry: { findUnique: jest.fn(), update: jest.fn() },
      eventQuote: { upsert: jest.fn() },
    };
    const notifications = { enqueue: jest.fn() };
    const service = new EventEnquiriesService(
      prisma as PrismaService,
      {} as StripeService,
      notifications as unknown as NotificationsService,
    );

    await expect(
      service.submitQuote(
        'enquiry-1',
        { id: 'owner', email: 'owner@example.com', role: 'vendor' } as AuthUser,
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.eventEnquiry.findUnique).not.toHaveBeenCalled();
    expect(prisma.eventQuote.upsert).not.toHaveBeenCalled();
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('does not reserve a read-only demo or create a Stripe deposit for an event booking', async () => {
    process.env.NODE_ENV = 'test';
    const prisma: any = {
      eventEnquiry: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'enquiry-1',
          customerId: 'customer-1',
          status: 'open',
          guestCount: 10,
          depositPiId: null,
          vendorId: null,
          quotes: [
            {
              id: 'quote-1',
              vendorId: 'demo-vendor',
              status: 'submitted',
              expiresAt: null,
              perHeadPence: 500,
              deliveryFeePence: 0,
              legacyDepositPct: null,
              minimumDepositPence: 0,
            },
          ],
        }),
      },
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          publicDemo: true,
          isSeedData: false,
          user: { isTestData: true },
        }),
      },
      eventQuote: { updateMany: jest.fn() },
    };
    const stripe = { createPaymentIntent: jest.fn(), retrieve: jest.fn() };
    const service = new EventEnquiriesService(
      prisma as PrismaService,
      stripe as unknown as StripeService,
      {} as NotificationsService,
    );

    await expect(
      service.selectVendor('enquiry-1', 'customer-1', { vendorId: 'demo-vendor' }),
    ).rejects.toThrow('This vendor cannot accept event bookings');
    expect(stripe.createPaymentIntent).not.toHaveBeenCalled();
    expect(prisma.eventQuote.updateMany).not.toHaveBeenCalled();
  });
});