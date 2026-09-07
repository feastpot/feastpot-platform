import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { ROLES_KEY } from '../../auth/decorators/roles.decorator';

import { CateringEnquiriesController } from './catering-enquiries.controller';

describe('CateringEnquiriesController read access', () => {
  const enquiries = {
    list: jest.fn(),
    getById: jest.fn(),
  };
  const controller = new CateringEnquiriesController(enquiries as never);

  beforeEach(() => jest.clearAllMocks());

  it('allows finance on the read-only list and detail routes', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CateringEnquiriesController.prototype.list)).toContain(
      UserRole.finance,
    );
    expect(Reflect.getMetadata(ROLES_KEY, CateringEnquiriesController.prototype.getById)).toContain(
      UserRole.finance,
    );
  });

  it('rejects fixture access for non-admin readers', () => {
    expect(() =>
      controller.list(undefined, undefined, undefined, 'true', { id: 'support', role: UserRole.support }),
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.getById('00000000-0000-0000-0000-000000000000', 'true', {
        id: 'finance',
        role: UserRole.finance,
      }),
    ).toThrow(ForbiddenException);
  });
});