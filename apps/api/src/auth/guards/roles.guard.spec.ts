import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { RolesGuard } from './roles.guard';

function ctxWith(user: { role: UserRole } | null): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class C {},
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  beforeEach(() => jest.clearAllMocks());

  it('allows when no roles required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(undefined);
    expect(guard.canActivate(ctxWith({ role: UserRole.customer }))).toBe(true);
  });

  it('allows when user role is in required list', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce([UserRole.admin, UserRole.finance]);
    expect(guard.canActivate(ctxWith({ role: UserRole.finance }))).toBe(true);
  });

  it('forbids when user role missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce([UserRole.admin]);
    expect(() => guard.canActivate(ctxWith(null))).toThrow(ForbiddenException);
  });

  it('forbids when user role not in required list', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce([UserRole.admin]);
    expect(() => guard.canActivate(ctxWith({ role: UserRole.customer }))).toThrow(ForbiddenException);
  });
});
