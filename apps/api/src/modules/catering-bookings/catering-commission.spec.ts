import { COMMISSION_RATES } from '@feastpot/config/commission-rates';
import { BadRequestException } from '@nestjs/common';
import { AttributionSource, CateringBookingStatus, OrderSource, UserRole } from '@prisma/client';
import { validate } from 'class-validator';

import type { AuthUser } from '../../auth/types';
import { CommissionService } from '../../commission/commission.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StripeService } from '../../stripe/stripe.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailProvider } from '../notifications/providers/email.provider';
import type { PaymentsService } from '../payments/payments.service';

import { CateringBookingsService } from './catering-bookings.service';
import { CreateCateringBookingDto } from './dto/create-catering-booking.dto';
import { FillCateringQuoteDto } from './dto/fill-catering-quote.dto';

describe('isolated catering commission', () => {
  const user = { id: 'owner', role: UserRole.vendor } as AuthUser;
  const vendor = { id: 'vendor', userId: user.id, publicDemo: false, isSeedData: false };
  const eventDate = new Date('2030-12-20T18:00:00Z');
  const quote = {
    enquiryId: 'enquiry',
    eventDate: eventDate.toISOString(),
    minimumDepositPence: 0,
    // Entire £700 quote, not just food: delivery and setup are commissionable.
    lineItems: [
      { description: 'Food', quantity: 10, unitPence: 6_000, allergens: [] },
      { description: 'Delivery and setup', quantity: 1, unitPence: 10_000, allergens: [] },
    ],
  };

  function harness(attributionSource: AttributionSource | null = null) {
    const booking = {
      id: 'booking',
      vendorId: vendor.id,
      enquiryId: 'enquiry',
      status: CateringBookingStatus.ASSIGNED,
      eventDate,
      guestCount: 10,
      vendor,
      attributionSource,
    };
    const prisma: any = {
      vendor: { findUnique: jest.fn().mockResolvedValue(vendor) },
      cateringEnquiry: {
        findUnique: jest.fn().mockResolvedValue({
          guestCountBand: '10-20',
          eventDate: eventDate.toISOString(),
          email: 'test@example.com',
        }),
      },
      cateringBooking: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'booking', ...data })),
        update: jest.fn().mockImplementation(async ({ data }) => ({ id: 'booking', ...data })),
      },
      cateringLineItem: { deleteMany: jest.fn() },
      commissionRate: {
        findFirst: jest.fn(() => {
          throw new Error('Marketplace DB lookup forbidden');
        }),
      },
      $transaction: jest.fn(async (work: (tx: any) => Promise<unknown>) => work(prisma)),
    };
    const commission = new CommissionService(prisma as PrismaService);
    const marketplace = jest
      .spyOn(commission, 'resolveRateAndCompute')
      .mockImplementation(async () => {
        throw new Error('Marketplace computation forbidden for catering');
      });
    const calculator = jest.spyOn(commission, 'computeCateringCommission');
    const service = new CateringBookingsService(
      prisma as PrismaService,
      {} as StripeService,
      {} as NotificationsService,
      {} as EmailProvider,
      commission,
      {} as PaymentsService,
    );
    return { service, commission, prisma, booking, marketplace, calculator };
  }

  it.each(['create', 'fill'] as const)(
    '%s resolves the canonical catering rate and snapshots £70 / £630 on £700',
    async (path) => {
      const h = harness();
      if (path === 'fill') h.prisma.cateringBooking.findUnique.mockResolvedValue(h.booking);
      const result =
        path === 'create'
          ? await h.service.createQuote(user, quote)
          : await h.service.fillQuote('booking', user, quote);
      expect(h.calculator).toHaveBeenCalledTimes(1);
      expect(h.calculator).toHaveBeenCalledWith(70_000, 'CATERING');
      expect(result.commissionPercent.toNumber()).toBe(COMMISSION_RATES.catering.percent);
      expect(result.commissionPercent.toNumber()).toBe(10);
      expect(result.totalPence).toBe(70_000);
      expect(result.commissionPence).toBe(7_000);
      expect(result.totalPence - result.commissionPence).toBe(63_000);
      expect(h.calculator.mock.results[0].value.vendorPayoutPence).toBe(63_000);
      expect(Number.isSafeInteger(result.commissionPence)).toBe(true);
      expect(result.commissionRateId).toBeNull();
      expect(result.attributionSource).toBeNull();
      expect(h.marketplace).not.toHaveBeenCalled();
      expect(h.prisma.commissionRate.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each(['create', 'fill'] as const)(
    '%s charges vendor-referred catering at the confirmed 5%, never ordinary referral 0%',
    async (path) => {
      const h = harness();
      if (path === 'fill') h.prisma.cateringBooking.findUnique.mockResolvedValue(h.booking);
      const dto = { ...quote, vendorReferred: true };
      const result =
        path === 'create'
          ? await h.service.createQuote(user, dto)
          : await h.service.fillQuote('booking', user, dto);
      expect(h.calculator).toHaveBeenCalledWith(70_000, 'CATERING_VENDOR_REFERRED');
      expect(result.commissionPercent.toNumber()).toBe(5);
      expect(result.commissionPence).toBe(3_500);
      expect(result.totalPence - result.commissionPence).toBe(66_500);
      expect(h.calculator.mock.results[0].value.vendorPayoutPence).toBe(66_500);
      expect(result.attributionSource).toBe(AttributionSource.VENDOR_REFERRED);
      expect(h.marketplace).not.toHaveBeenCalled();
    },
  );

  it('preserves stored referral on assignment when omitted, but respects explicit false', async () => {
    const h = harness(AttributionSource.VENDOR_REFERRED);
    h.prisma.cateringBooking.findUnique.mockResolvedValue(h.booking);
    expect((await h.service.fillQuote('booking', user, quote)).commissionPence).toBe(3_500);
    expect(
      (
        await h.service.fillQuote('booking', user, {
          ...quote,
          vendorReferred: false,
        })
      ).commissionPence,
    ).toBe(7_000);
  });

  it.each([
    OrderSource.MARKETPLACE,
    OrderSource.VENDOR_REFERRED,
    AttributionSource.MARKETPLACE_FIRST,
    AttributionSource.MARKETPLACE_REPEAT,
  ])('rejects non-catering source %s even if its numeric rate matches', (source) => {
    expect(() => harness().commission.computeCateringCommission(70_000, source as never)).toThrow(
      BadRequestException,
    );
  });

  it.each([
    ['CATERING', 1, 0],
    ['CATERING', 5, 1],
    ['CATERING', 15, 2],
    ['CATERING_VENDOR_REFERRED', 9, 0],
    ['CATERING_VENDOR_REFERRED', 10, 1],
    ['CATERING_VENDOR_REFERRED', 30, 2],
  ] as const)('rounds integer pence half-up: %s / %i', (source, total, expected) => {
    const result = harness().commission.computeCateringCommission(total, source);
    expect(result.commissionPence).toBe(expected);
    expect(result.vendorPayoutPence + result.commissionPence).toBe(total);
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, 2_147_483_648])(
    'rejects invalid pence %s',
    (total) => {
      expect(() => harness().commission.computeCateringCommission(total, 'CATERING')).toThrow(
        BadRequestException,
      );
    },
  );

  it.each([CreateCateringBookingDto, FillCateringQuoteDto])(
    'requires an explicit boolean referral declaration on %p',
    async (Dto) => {
      const dto = Object.assign(new Dto(), { ...quote, vendorReferred: 'false' });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'vendorReferred')).toBe(true);
    },
  );
});
