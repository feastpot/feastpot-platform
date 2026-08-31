import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import type { AuthUser } from '../types';

import { AalGuard } from './aal.guard';

function contextWith(user: AuthUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class StaffController {},
  } as unknown as ExecutionContext;
}

describe('AalGuard', () => {
  const reflector = new Reflector();

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects an aal1 staff session on a staff route when enforcement is enabled', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.admin]);
    const config = { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService;
    const guard = new AalGuard(reflector, config);

    expect(() =>
      guard.canActivate(
        contextWith({
          id: 'staff-1',
          email: 'staff@example.test',
          role: UserRole.admin,
          aal: 'aal1',
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows an aal2 staff session on an allowed staff route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.admin]);
    const config = { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService;
    const guard = new AalGuard(reflector, config);

    expect(
      guard.canActivate(
        contextWith({
          id: 'staff-1',
          email: 'staff@example.test',
          role: UserRole.admin,
          aal: 'aal2',
        }),
      ),
    ).toBe(true);
  });

  it('does not alter customer or vendor access', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.customer]);
    const config = { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService;
    const guard = new AalGuard(reflector, config);

    expect(
      guard.canActivate(
        contextWith({
          id: 'customer-1',
          email: 'customer@example.test',
          role: UserRole.customer,
          aal: 'aal1',
        }),
      ),
    ).toBe(true);
  });
});
