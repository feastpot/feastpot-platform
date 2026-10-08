import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

import { CateringBookingsController } from './catering-bookings.controller';

describe('Catering guest payment boundary', () => {
  it.each(['initiateDeposit', 'confirmDeposit', 'initiateBalance', 'confirmBalance'] as const)(
    'allows guest-link access to %s through the global authentication guard',
    (handler) => {
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, CateringBookingsController.prototype[handler]),
      ).toBe(true);
    },
  );

  it.each([
    'createQuote',
    'listMine',
    'sendQuote',
    'cancel',
    'listAll',
    'declineAssignment',
    'fillQuote',
    'getById',
  ] as const)('does not make %s public', (handler) => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, CateringBookingsController.prototype[handler]),
    ).not.toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CateringBookingsController)).not.toBe(true);
  });

  it.each(['confirmDeposit', 'confirmBalance'] as const)(
    '%s returns only confirmation, never private booking details',
    async (handler) => {
      const service = {
        [handler]: jest.fn().mockResolvedValue({
          id: 'booking-1',
          customerName: 'Private Customer',
          customerEmail: 'private@example.test',
          customerId: 'private-user',
          eventAddress: 'Private address',
        }),
      };
      const controller = new CateringBookingsController(service as never);
      expect(await controller[handler]('booking-1', { paymentIntentId: 'pi_payment' })).toEqual({
        confirmed: true,
      });
      expect(service[handler]).toHaveBeenCalledWith('booking-1', 'pi_payment');
    },
  );

  it('does not report confirmation when the ledger writer fails', async () => {
    const service = {
      confirmBalance: jest.fn().mockRejectedValue(new Error('Ledger unavailable')),
    };
    const controller = new CateringBookingsController(service as never);
    await expect(
      controller.confirmBalance('booking-1', { paymentIntentId: 'pi_payment' }),
    ).rejects.toThrow('Ledger unavailable');
  });
});
