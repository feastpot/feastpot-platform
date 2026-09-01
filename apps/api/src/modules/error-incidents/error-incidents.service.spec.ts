import { UserRole } from '@prisma/client';

import { ErrorIncidentsService, type ErrorIncidentRow } from './error-incidents.service';

jest.mock('@sentry/nestjs', () => ({
  captureMessage: jest.fn(),
}));

describe('ErrorIncidentsService', () => {
  const persistedAt = new Date('2026-08-31T10:15:00.000Z');
  const prisma = {
    vendor: {
      findUnique: jest.fn(),
    },
    errorIncident: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  let service: ErrorIncidentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ErrorIncidentsService(prisma as never);
    prisma.errorIncident.create.mockImplementation(({ data }) => ({
      ...data,
      createdAt: persistedAt,
    }));
  });

  it('stores anonymous reports without attribution even when legacy IDs are submitted', async () => {
    await service.create(
      {
        app: 'web',
        route: '/checkout',
        message: 'Payment page failed',
        vendorId: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
      },
      null,
      'test-agent',
    );

    expect(prisma.vendor.findUnique).not.toHaveBeenCalled();
    expect(prisma.errorIncident.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        app: 'web',
        route: '/checkout',
        vendorId: null,
        userId: null,
        userAgent: 'test-agent',
      }),
    });
  });

  it('uses the validated vendor principal and ignores conflicting client IDs', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' });

    await service.create(
      {
        app: 'vendor',
        route: '/orders',
        message: 'Order list failed',
        vendorId: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        email: 'vendor@example.test',
        role: UserRole.vendor,
      },
    );

    expect(prisma.vendor.findUnique).toHaveBeenCalledWith({
      where: { userId: '44444444-4444-4444-8444-444444444444' },
      select: { id: true },
    });
    expect(prisma.errorIncident.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vendorId: '33333333-3333-4333-8333-333333333333',
        userId: '44444444-4444-4444-8444-444444444444',
      }),
    });
  });

  it('returns a persisted support reference that resolves to the stored incident details', async () => {
    const created = await service.create(
      {
        app: 'admin',
        route: '/error-incidents',
        message: 'Lookup failed',
        digest: 'digest-123',
      },
      null,
    );
    prisma.errorIncident.findUnique.mockResolvedValue(created);

    expect(created.ref).toMatch(/^FP-[0-9A-F]{4}-[0-9A-F]{4}$/);

    const lookedUp = await service.findByRef(created.ref);
    expect(prisma.errorIncident.findUnique).toHaveBeenCalledWith({
      where: { ref: created.ref },
    });
    expect(lookedUp).toEqual(
      expect.objectContaining<Partial<ErrorIncidentRow>>({
        ref: created.ref,
        app: 'admin',
        route: '/error-incidents',
        message: 'Lookup failed',
        digest: 'digest-123',
        createdAt: persistedAt,
      }),
    );
  });
});
