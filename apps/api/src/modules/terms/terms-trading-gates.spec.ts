import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { OrderStatus, UserRole, VendorStatus } from '@prisma/client';
import type { Queue } from 'bull';

import type { AuthUser } from '../../auth/types';
import type { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { VendorsService } from '../vendors/vendors.service';

import { TermsService } from './terms.service';

describe('current Vendor Terms trading gates', () => {
  let terms: TermsService;
  let acceptance: jest.Mock;
  const actor = { id: 'owner', role: UserRole.vendor } as AuthUser;

  beforeEach(() => {
    acceptance = jest.fn().mockResolvedValue(null);
    terms = new TermsService(
      {
        termsVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'effective-current' }) },
        termsAcceptance: { findUnique: acceptance },
      } as unknown as PrismaService,
      {} as Queue,
    );
  });

  it('does not count an acceptance of an old or future version', async () => {
    await expect(terms.assertAcceptedCurrentVersion('vendor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(acceptance).toHaveBeenCalledWith({
      where: {
        vendorId_termsVersionId: { vendorId: 'vendor', termsVersionId: 'effective-current' },
      },
      select: { id: true },
    });
    acceptance.mockResolvedValue({ id: 'acceptance' });
    await expect(terms.assertAcceptedCurrentVersion('vendor')).resolves.toBeUndefined();
  });

  it('blocks going live before any status write, even when readiness would pass', async () => {
    const transitionStatus = jest.fn();
    const readiness = jest.fn();
    const service = Object.assign(Object.create(VendorsService.prototype), {
      repo: {
        findById: jest.fn().mockResolvedValue({ status: VendorStatus.approved }),
        transitionStatus,
      },
      terms,
      onboarding: { assertCanProfileGoLive: readiness },
    }) as VendorsService;
    await expect(
      service.updateStatus(
        'vendor',
        { status: VendorStatus.live },
        {
          ...actor,
          role: UserRole.admin,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transitionStatus).not.toHaveBeenCalled();
    expect(readiness).not.toHaveBeenCalled();
  });

  it.each([UserRole.vendor, UserRole.admin])(
    'blocks order acceptance for %s before writing or notifying',
    async (role) => {
      const transition = jest.fn();
      const service = Object.assign(Object.create(OrdersService.prototype), {
        repo: {
          findByIdWithItems: jest
            .fn()
            .mockResolvedValue({ id: 'order', vendorId: 'vendor', status: OrderStatus.pending }),
        },
        members: { canActOnVendor: jest.fn().mockResolvedValue(true) },
        terms,
        applyVendorTransition: transition,
      }) as OrdersService;
      await expect(
        service.updateStatus(
          'order',
          { status: OrderStatus.accepted },
          {
            ...actor,
            role,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transition).not.toHaveBeenCalled();
      acceptance.mockResolvedValue({ id: 'acceptance' });
      await service.updateStatus('order', { status: OrderStatus.accepted }, { ...actor, role });
      expect(transition).toHaveBeenCalledTimes(1);
    },
  );

  it('fails closed when terms eligibility cannot be checked', async () => {
    const service = Object.assign(Object.create(OrdersService.prototype), {
      repo: {
        findByIdWithItems: jest
          .fn()
          .mockResolvedValue({ id: 'order', vendorId: 'vendor', status: OrderStatus.pending }),
      },
      members: { canActOnVendor: jest.fn().mockResolvedValue(true) },
    }) as OrdersService;
    await expect(
      service.updateStatus('order', { status: OrderStatus.accepted }, actor),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
