import { UserRole } from '@prisma/client';

import { AdminController } from './admin.controller';

describe('Commission legal publication boundary', () => {
  const dto = {
    source: 'MARKETPLACE',
    isFirstOrder: true,
    ratePercent: 99,
    effectiveFrom: new Date(Date.now() + 86400000).toISOString(),
    note: 'Written policy justification for the proposed change.',
  };
  function setup() {
    const commissionService = {
      listRates: jest.fn().mockResolvedValue([]),
      createRate: jest.fn().mockResolvedValue({ id: 'new-rate' }),
    };
    const termsService = { publishRateScheduleVersion: jest.fn() };
    const controller = Object.assign(Object.create(AdminController.prototype), {
      commissionService,
      termsService,
    }) as AdminController;
    return { controller, commissionService, termsService };
  }
  it('does not write a new slot when legal notice validation rejects it', async () => {
    const { controller, commissionService, termsService } = setup();
    termsService.publishRateScheduleVersion.mockRejectedValue(new Error('15 days required'));
    await expect(
      controller.createCommissionRate(
        dto as never,
        { user: { id: 'actor', role: UserRole.admin } } as never,
      ),
    ).rejects.toThrow('15 days required');
    expect(commissionService.createRate).not.toHaveBeenCalled();
  });
  it('writes the rate using the legal publisher transaction', async () => {
    const { controller, commissionService, termsService } = setup();
    const transaction = { marker: 'publisher-transaction' };
    termsService.publishRateScheduleVersion.mockImplementation(async (_options, callback) =>
      callback(transaction),
    );
    await expect(
      controller.createCommissionRate(
        dto as never,
        { user: { id: 'actor', role: UserRole.admin } } as never,
      ),
    ).resolves.toEqual({ id: 'new-rate' });
    expect(commissionService.createRate).toHaveBeenCalledWith(expect.any(Object), transaction);
  });
  it('does not hide a failed transactional rate write', async () => {
    const { controller, commissionService, termsService } = setup();
    commissionService.createRate.mockRejectedValue(new Error('rate write failed'));
    termsService.publishRateScheduleVersion.mockImplementation(async (_options, callback) =>
      callback({}),
    );
    await expect(
      controller.createCommissionRate(
        dto as never,
        { user: { id: 'actor', role: UserRole.admin } } as never,
      ),
    ).rejects.toThrow('rate write failed');
  });
});
