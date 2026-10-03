import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { CateringBookingVendorAccessGuard } from './catering-booking-vendor-access.guard';

describe('Catering booking vendor access', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const findUnique = jest.fn();
  const guard = new CateringBookingVendorAccessGuard({
    cateringBooking: { findUnique },
  } as unknown as PrismaService);
  const context = (user?: { id: string; role: UserRole }, bookingId = id) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user, params: { id: bookingId } }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => findUnique.mockReset());

  it('rejects another vendor before payment or QR handler shortcuts', async () => {
    findUnique.mockResolvedValue({ vendor: { userId: 'owner' } });
    await expect(
      guard.canActivate(context({ id: 'other', role: UserRole.vendor })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows the owning vendor', async () => {
    findUnique.mockResolvedValue({ vendor: { userId: 'owner' } });
    await expect(guard.canActivate(context({ id: 'owner', role: UserRole.vendor }))).resolves.toBe(
      true,
    );
  });

  it.each([undefined, UserRole.customer, UserRole.admin, UserRole.support, UserRole.finance])(
    'does not alter existing customer or staff behaviour: %s',
    async (role) => {
      await expect(
        guard.canActivate(context(role ? { id: 'caller', role } : undefined)),
      ).resolves.toBe(true);
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('leaves invalid UUIDs to the existing parameter pipe', async () => {
    await expect(
      guard.canActivate(context({ id: 'owner', role: UserRole.vendor }, 'invalid')),
    ).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
