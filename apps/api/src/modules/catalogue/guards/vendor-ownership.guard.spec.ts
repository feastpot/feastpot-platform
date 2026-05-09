import { ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { AuthUser } from '../../../auth/types';
import { PrismaService } from '../../../prisma/prisma.service';

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
  const prisma = { vendor: { findUnique } } as unknown as PrismaService;
  const guard = new VendorOwnershipGuard(prisma);

  beforeEach(() => findUnique.mockReset());

  it('throws Unauthorized for anonymous requests', async () => {
    await expect(guard.canActivate(makeContext(null, 'v-1'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('admin always passes regardless of vendor ownership', async () => {
    const admin: AuthUser = { id: 'u-admin', email: 'a@x', role: UserRole.admin };
    await expect(guard.canActivate(makeContext(admin, 'v-1'))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('throws NotFound when vendor does not exist', async () => {
    findUnique.mockResolvedValue(null);
    const vendor: AuthUser = { id: 'u-vend', email: 'v@x', role: UserRole.vendor };
    await expect(guard.canActivate(makeContext(vendor, 'v-1'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Forbidden when vendor belongs to a different user', async () => {
    findUnique.mockResolvedValue({ id: 'v-1', userId: 'someone-else' });
    const vendor: AuthUser = { id: 'u-vend', email: 'v@x', role: UserRole.vendor };
    await expect(guard.canActivate(makeContext(vendor, 'v-1'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes when vendor belongs to the user', async () => {
    findUnique.mockResolvedValue({ id: 'v-1', userId: 'u-vend' });
    const vendor: AuthUser = { id: 'u-vend', email: 'v@x', role: UserRole.vendor };
    await expect(guard.canActivate(makeContext(vendor, 'v-1'))).resolves.toBe(true);
  });

  it('throws Forbidden when vendorId param missing', async () => {
    const vendor: AuthUser = { id: 'u-vend', email: 'v@x', role: UserRole.vendor };
    await expect(guard.canActivate(makeContext(vendor))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
