import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';

import { OptionalAuthGuard } from '../../auth/guards/optional-auth.guard';

import { ErrorIncidentsController } from './error-incidents.controller';
import type { ErrorIncidentRow } from './error-incidents.service';

describe('ErrorIncidentsController', () => {
  const service = {
    create: jest.fn(),
    findByRef: jest.fn(),
    listRecent: jest.fn(),
  };

  let controller: ErrorIncidentsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ErrorIncidentsController(service as never);
  });

  it('keeps the public endpoint available while attaching optional authentication', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ErrorIncidentsController.prototype.create),
    ).toContain(OptionalAuthGuard);
  });

  it('threads the optionally validated session principal into incident creation', async () => {
    const principal = {
      id: '44444444-4444-4444-8444-444444444444',
      email: 'vendor@example.test',
      role: UserRole.vendor,
    };
    const dto = {
      app: 'vendor',
      route: '/orders',
      message: 'Order list failed',
      userId: '22222222-2222-4222-8222-222222222222',
    };
    service.create.mockResolvedValue({ ref: 'FP-ABCD-1234' });

    await expect(
      controller.create(dto, {
        user: principal,
        headers: { 'user-agent': 'browser-agent' },
      } as never),
    ).resolves.toEqual({ ref: 'FP-ABCD-1234' });

    expect(service.create).toHaveBeenCalledWith(dto, principal, 'browser-agent');
  });

  it('passes null attribution for anonymous requests', async () => {
    const dto = {
      app: 'web',
      route: '/checkout',
      message: 'Checkout failed',
      vendorId: '11111111-1111-4111-8111-111111111111',
    };
    service.create.mockResolvedValue({ ref: 'FP-ABCD-5678' });

    await controller.create(dto, { user: null, headers: {} } as never);

    expect(service.create).toHaveBeenCalledWith(dto, null, undefined);
  });

  it('looks up the exact persisted support reference and returns its details', async () => {
    const incident: ErrorIncidentRow = {
      id: 'incident-id',
      ref: 'FP-ABCD-1234',
      app: 'vendor',
      route: '/orders',
      message: 'Order list failed',
      digest: 'digest-123',
      vendorId: null,
      userId: null,
      createdAt: new Date('2026-08-31T10:15:00.000Z'),
    };
    service.findByRef.mockResolvedValue(incident);

    await expect(controller.findOne('fp-abcd-1234')).resolves.toBe(incident);
    expect(service.findByRef).toHaveBeenCalledWith('FP-ABCD-1234');
  });

  it('returns not found for an unknown support reference', async () => {
    service.findByRef.mockResolvedValue(null);

    await expect(controller.findOne('FP-FFFF-FFFF')).rejects.toBeInstanceOf(NotFoundException);
  });
});
