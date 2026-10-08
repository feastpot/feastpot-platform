import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CateringBookingStatus } from '@prisma/client';

import { CateringBookingsService } from './catering-bookings.service';

describe('Catering balance payment-link initiation', () => {
  function build(bookingOverrides = {}, intentOverrides = {}) {
    const booking = {
      id: 'booking-1',
      status: CateringBookingStatus.CONFIRMED,
      balancePiId: 'pi_balance',
      balancePence: 45_000,
      customerEmail: 'private@example.test',
      customerName: 'Private Customer',
      ...bookingOverrides,
    };
    const intent = {
      id: 'pi_balance',
      client_secret: 'fixture_client_secret',
      metadata: { bookingId: 'booking-1', kind: 'catering_balance' },
      amount: 45_000,
      currency: 'gbp',
      capture_method: 'automatic',
      status: 'requires_payment_method',
      ...intentOverrides,
    };
    const prisma = {
      cateringBooking: {
        findUnique: jest.fn().mockResolvedValue(booking),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const stripe = {
      retrieve: jest.fn().mockResolvedValue(intent),
      createPaymentIntentGeneric: jest.fn(),
      capture: jest.fn(),
    };
    const service = new CateringBookingsService(
      prisma as never,
      stripe as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, stripe };
  }

  it('returns only the existing intent secret and exact balance, without writes or charges', async () => {
    const { service, prisma, stripe } = build();
    expect(await service.initiateBalance('booking-1')).toEqual({
      clientSecret: 'fixture_client_secret',
      balancePence: 45_000,
    });
    expect(stripe.retrieve).toHaveBeenCalledWith('pi_balance');
    expect(stripe.createPaymentIntentGeneric).not.toHaveBeenCalled();
    expect(stripe.capture).not.toHaveBeenCalled();
    expect(prisma.cateringBooking.create).not.toHaveBeenCalled();
    expect(prisma.cateringBooking.update).not.toHaveBeenCalled();
  });

  it('rejects missing bookings before calling Stripe', async () => {
    const { service, prisma, stripe } = build();
    prisma.cateringBooking.findUnique.mockResolvedValue(null as never);
    await expect(service.initiateBalance('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(stripe.retrieve).not.toHaveBeenCalled();
  });

  it.each(Object.values(CateringBookingStatus).filter((status) => status !== 'CONFIRMED'))(
    'rejects %s bookings before calling Stripe',
    async (status) => {
      const { service, stripe } = build({ status });
      await expect(service.initiateBalance('booking-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stripe.retrieve).not.toHaveBeenCalled();
    },
  );

  it.each([{ balancePiId: null }, { balancePence: 0 }, { balancePence: -100 }])(
    'rejects unscheduled or non-positive balances: %j',
    async (override) => {
      const { service, stripe } = build(override);
      await expect(service.initiateBalance('booking-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stripe.retrieve).not.toHaveBeenCalled();
    },
  );

  it.each([
    { metadata: { bookingId: 'another-booking', kind: 'catering_balance' } },
    { metadata: { bookingId: 'booking-1', kind: 'catering_deposit' } },
    { amount: 44_999 },
    { currency: 'usd' },
    { capture_method: 'manual' },
    { status: 'canceled' },
    { client_secret: null },
  ])('rejects invalid intent data: %j', async (override) => {
    const { service, stripe } = build({}, override);
    await expect(service.initiateBalance('booking-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(stripe.capture).not.toHaveBeenCalled();
  });

  it('returns a succeeded intent for confirmation retry, without another charge', async () => {
    const { service, stripe } = build({}, { status: 'succeeded' });
    await expect(service.initiateBalance('booking-1')).resolves.toHaveProperty(
      'balancePence',
      45_000,
    );
    expect(stripe.createPaymentIntentGeneric).not.toHaveBeenCalled();
    expect(stripe.capture).not.toHaveBeenCalled();
  });
});
