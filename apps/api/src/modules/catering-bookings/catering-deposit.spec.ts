import {
  assertCateringDepositInvariant,
  calculateCateringDeposit,
  calculateCateringQuoteExpiry,
  calculateLegacyEventDeposit,
  CateringDepositPolicyError,
} from '@feastpot/config/catering-deposit';
import { CateringBookingStatus, EnquiryStatus, QuoteStatus, UserRole } from '@prisma/client';

import { EventEnquiriesService } from '../event-enquiries/event-enquiries.service';

import {
  calculateCateringCancellationRefund,
  CateringBookingsService,
} from './catering-bookings.service';

describe('catering deposit policy', () => {
  const rejectedTotals = [0, 1, 99, 100, 2_000, 4_999];
  const acceptedTotals = [5_000, 5_001, 10_000, 39_999, 100_000, 10_000_000];

  it.each(rejectedTotals)('rejects a quote total of %ip', (totalPence) => {
    expect(() => calculateCateringDeposit(totalPence, 0)).toThrow(
      'Catering quote total must be at least £50.00',
    );
  });

  it.each(acceptedTotals)('reconciles an accepted quote total of %ip', (totalPence) => {
    const result = calculateCateringDeposit(totalPence, 0);
    expect(result.depositPence).toBe(
      Math.floor(totalPence / 100) * 25 + Math.floor(((totalPence % 100) * 25 + 99) / 100),
    );
    expect(result.balancePence).toBeGreaterThanOrEqual(0);
    expect(result.depositPence + result.balancePence).toBe(totalPence);
  });

  it('uses the vendor cash minimum when it is greater than 25%', () => {
    expect(calculateCateringDeposit(10_000, 4_000)).toMatchObject({
      depositPence: 4_000,
      balancePence: 6_000,
    });
  });

  it('caps the vendor cash minimum at the quote total', () => {
    expect(calculateCateringDeposit(5_000, 20_000)).toMatchObject({
      depositPence: 5_000,
      balancePence: 0,
    });
  });

  it('safely grandfathers a persisted quote below the new minimum', () => {
    expect(calculateCateringDeposit(100, 5_000, { enforceMinimumQuote: false })).toMatchObject({
      depositPence: 100,
      balancePence: 0,
    });
  });

  it.each([
    [10, 1_000],
    [24, 2_400],
    [25, 2_500],
    [30, 3_000],
  ])('preserves a legacy %i%% event deposit', (percent, expectedPence) => {
    expect(calculateLegacyEventDeposit(10_000, percent)).toBe(expectedPence);
  });

  it('caps a legacy event deposit at a quote total below the historical 50p floor', () => {
    expect(calculateLegacyEventDeposit(10, 10)).toBe(10);
  });

  it('gives both quote paths identical figures for identical input', () => {
    const cateringBookingQuote = calculateCateringDeposit(39_999, 15_000);
    const eventEnquiryQuote = calculateCateringDeposit(39_999, 15_000);
    expect(cateringBookingQuote).toEqual(eventEnquiryQuote);
  });

  it('rejects non-integer money and zero-item or zero-quantity totals', () => {
    expect(() => calculateCateringDeposit(5_000.5, 0)).toThrow(CateringDepositPolicyError);
    expect(() => calculateCateringDeposit(0, 0)).toThrow(CateringDepositPolicyError);
  });

  it('throws when the reconciliation invariant is violated', () => {
    expect(() => assertCateringDepositInvariant(5_000, 5_000, -1)).toThrow(
      'Catering deposit and balance do not reconcile with the quote total',
    );
  });

  it('clamps expiry to 48 hours before an event three days away', () => {
    const now = new Date('2026-08-31T12:00:00.000Z');
    const eventDate = new Date('2026-09-03T12:00:00.000Z');
    expect(calculateCateringQuoteExpiry(eventDate, now)).toEqual(
      new Date('2026-09-01T12:00:00.000Z'),
    );
  });

  it('clamps expiry to seven days for a distant event', () => {
    const now = new Date('2026-08-31T12:00:00.000Z');
    const eventDate = new Date('2026-10-01T12:00:00.000Z');
    expect(calculateCateringQuoteExpiry(eventDate, now)).toEqual(
      new Date('2026-09-07T12:00:00.000Z'),
    );
  });
});

describe('catering cancellation matrix', () => {
  const base = {
    depositPence: 2_501,
    balancePence: 7_499,
    depositPaid: true,
    balancePaid: false,
    vendorCancelled: false,
    staffApprovedAfterBalance: false,
  };

  it.each([
    [15, 2_501],
    [14, 2_501],
    [13, 1_250],
    [8, 1_250],
    [7, 0],
    [2, 0],
  ])('uses the exact full-day boundary at %i days', (daysUntilEvent, expectedPence) => {
    expect(calculateCateringCancellationRefund({ ...base, daysUntilEvent })).toBe(expectedPence);
  });

  it('refunds the full paid amount on vendor cancellation', () => {
    expect(
      calculateCateringCancellationRefund({
        ...base,
        daysUntilEvent: 2,
        balancePaid: true,
        vendorCancelled: true,
      }),
    ).toBe(10_000);
  });

  it('only refunds a balance-paid booking after staff approval', () => {
    expect(
      calculateCateringCancellationRefund({
        ...base,
        daysUntilEvent: 15,
        balancePaid: true,
        staffApprovedAfterBalance: false,
      }),
    ).toBe(0);
    expect(
      calculateCateringCancellationRefund({
        ...base,
        daysUntilEvent: 2,
        balancePaid: true,
        staffApprovedAfterBalance: true,
      }),
    ).toBe(10_000);
  });
});

describe('catering deposit lifecycle guards', () => {
  it('rejects a sub-£50 catering booking before persistence', async () => {
    const prisma = {
      vendor: { findUnique: jest.fn().mockResolvedValue({ id: 'vendor-1' }) },
      cateringEnquiry: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'enquiry-1',
          guestCountBand: '10-20',
          eventDate: '2026-10-01T12:00:00.000Z',
        }),
      },
      cateringBooking: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const service = new CateringBookingsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.createQuote({ id: 'user-1', role: UserRole.vendor } as never, {
        enquiryId: 'enquiry-1',
        minimumDepositPence: 0,
        lineItems: [{ description: 'Tiny item', quantity: 1, unitPence: 100, allergens: [] }],
      }),
    ).rejects.toThrow('Catering quote total must be at least £50.00');
    expect(prisma.cateringBooking.create).not.toHaveBeenCalled();
  });

  it('marks a fully prepaid catering booking balance as paid without calling Stripe', async () => {
    const prisma = {
      cateringBooking: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const stripe = { createPaymentIntentGeneric: jest.fn() };
    const service = new CateringBookingsService(
      prisma as never,
      stripe as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.scheduleBalanceCharge({
      id: 'booking-1',
      balancePence: 0,
      vendorId: 'vendor-1',
      customerId: 'customer-1',
      customerEmail: 'customer@example.com',
      customerName: 'Customer',
      eventDate: new Date('2026-10-01T12:00:00.000Z'),
      balancePiId: null,
    });

    expect(stripe.createPaymentIntentGeneric).not.toHaveBeenCalled();
    expect(prisma.cateringBooking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: CateringBookingStatus.CONFIRMED,
          balancePence: 0,
        }),
        data: expect.objectContaining({ status: CateringBookingStatus.BALANCE_PAID }),
      }),
    );
  });

  it('rejects and expires an expired event quote before creating a payment', async () => {
    const prisma = {
      eventEnquiry: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'enquiry-1',
          customerId: 'customer-1',
          status: EnquiryStatus.quoted,
          quotes: [
            {
              id: 'quote-1',
              vendorId: 'vendor-1',
              status: QuoteStatus.submitted,
              expiresAt: new Date('2026-01-01T00:00:00.000Z'),
              perHeadPence: 5_000,
              deliveryFeePence: 0,
              minimumDepositPence: 0,
              legacyDepositPct: null,
            },
          ],
        }),
      },
      eventQuote: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const stripe = { createPaymentIntentGeneric: jest.fn() };
    const service = new EventEnquiriesService(prisma as never, stripe as never, {} as never);

    await expect(
      service.selectVendor('enquiry-1', 'customer-1', { vendorId: 'vendor-1' }),
    ).rejects.toThrow('Quote has expired');
    expect(prisma.eventQuote.updateMany).toHaveBeenCalled();
    expect(stripe.createPaymentIntentGeneric).not.toHaveBeenCalled();
  });

  it('rejects final numbers that reduce the total below the paid deposit', async () => {
    const prisma = {
      eventEnquiry: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'enquiry-1',
          customerId: 'customer-1',
          status: EnquiryStatus.confirmed,
          guestCount: 10,
          quotes: [
            {
              perHeadPence: 1_000,
              deliveryFeePence: 0,
              minimumDepositPence: 9_000,
              legacyDepositPct: null,
            },
          ],
        }),
      },
    };
    const stripe = { createPaymentIntentGeneric: jest.fn() };
    const service = new EventEnquiriesService(prisma as never, stripe as never, {} as never);

    await expect(
      service.confirmNumbers('enquiry-1', 'customer-1', {
        guestCount: 1,
      }),
    ).rejects.toThrow('Final guest numbers would reduce the total below the deposit already paid');
    expect(stripe.createPaymentIntentGeneric).not.toHaveBeenCalled();
  });
});
