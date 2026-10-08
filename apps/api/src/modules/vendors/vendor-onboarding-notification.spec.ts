import { VendorsService } from './vendors.service';

function setup() {
  const vendor = {
    id: 'vendor',
    userId: 'owner',
    businessName: 'Test Kitchen',
    status: 'pending',
  };
  const readiness = { vendorId: 'vendor', canProfileGoLive: true };
  const dependencies = {
    resolveMyVendor: jest.fn().mockResolvedValue(vendor),
    onboarding: { getReadiness: jest.fn().mockResolvedValue(readiness) },
    prisma: { notification: { findFirst: jest.fn().mockResolvedValue(null) } },
    notifications: { enqueue: jest.fn().mockResolvedValue(undefined) },
  };
  const service = Object.assign(Object.create(VendorsService.prototype), dependencies);
  return { service: service as VendorsService, vendor, readiness, ...dependencies };
}

describe('vendor onboarding completion producer', () => {
  it('notifies the owner once eligible for go-live, not an authenticated team member', async () => {
    const state = setup();
    expect(await state.service.getOnboardingProgress('team-member')).toBe(state.readiness);
    expect(state.notifications.enqueue).toHaveBeenCalledWith(
      'vendor_onboarding_complete',
      { userId: 'owner', vendorId: 'vendor', vendorName: 'Test Kitchen' },
      { jobId: 'vendor_onboarding_complete:vendor' },
    );
  });

  it('does not notify an incomplete kitchen', async () => {
    const state = setup();
    state.readiness.canProfileGoLive = false;
    await state.service.getOnboardingProgress('owner');
    expect(state.notifications.enqueue).not.toHaveBeenCalled();
  });

  it('does not repeat a recorded completion notice', async () => {
    const state = setup();
    state.prisma.notification.findFirst.mockResolvedValue({ id: 'sent' });
    await state.service.getOnboardingProgress('owner');
    expect(state.notifications.enqueue).not.toHaveBeenCalled();
  });

  it('does not send a pending-review notice to an already-live kitchen', async () => {
    const state = setup();
    state.vendor.status = 'live';
    await state.service.getOnboardingProgress('owner');
    expect(state.notifications.enqueue).not.toHaveBeenCalled();
  });
});
