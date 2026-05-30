import { ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { AuthUser } from '../../../auth/types';
import { PrismaService } from '../../../prisma/prisma.service';
import type { VendorMembersService } from '../../vendor-members/vendor-members.service';

import { VendorOwnershipGuard } from './vendor-ownership.guard';

const makeContext = (user: AuthUser | null, vendorId?: string): ExecutionContext => {
  const request = { user, params: { ...(vendorId ? { vendorId } : {}) } };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
};

describe('VendorOwnershipGuard', () => {
  const findUnique = jest.fn();
  const canActOnVendor = jest.fn();
  const prisma = { vendor: { findUnique } } as unknown as PrismaService;
  const members = { canActOnVendor } as unknown as VendorMembersService;
  const guard = new VendorOwnershipGuard(prisma, members);

  beforeEach(() => {
    findUnique.mockReset();
    canActOnVendor.mockReset();
  });

  it('throws Unauthorized for anonymous requests', async () => {
    await expect(guard.canActivate(makeContext(null, 'v-1'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('admin always passes regardless of vendor ownership', async () => {
    const admin: AuthUser = { id: 'u-admin', email: 'a@x', role: UserRole.admin };
    await expect(guard.canActivate(makeContext(admin, 'v-1'))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
    expect(canActOnVendor).not.toHaveBeenCalled();
  });

  it('throws NotFound when vendor does not exist', async () => {
    findUnique.mockResolvedValue(null);
    const vendor: AuthUser = { id: 'u-vend', email: 'v@x', role: UserRole.vendor };
    await expect(guard.canActivate(makeContext(vendor, 'v-1'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Forbidden when the user has no menu-management role on the vendor team', async () => {
    findUnique.mockResolvedValue({ id: 'v-1' });
    canActOnVendor.mockResolvedValue(false);
    const vendor: AuthUser = { id: 'u-vend', email: 'v@x', role: UserRole.vendor };
    await expect(guard.canActivate(makeContext(vendor, 'v-1'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes when the user can act on the vendor team', async () => {
    findUnique.mockResolvedValue({ id: 'v-1' });
    canActOnVendor.mockResolvedValue(true);
    const vendor: AuthUser = { id: 'u-vend', email: 'v@x', role: UserRole.vendor };
    await expect(guard.canActivate(makeContext(vendor, 'v-1'))).resolves.toBe(true);
  });

  it('throws Forbidden when vendorId param missing', async () => {
    const vendor: AuthUser = { id: 'u-vend', email: 'v@x', role: UserRole.vendor };
    await expect(guard.canActivate(makeContext(vendor))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
