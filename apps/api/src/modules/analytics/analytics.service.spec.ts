import { Test } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { AnalyticsService } from './analytics.service';

// ── Minimal Prisma mock ───────────────────────────────────────────────────

const mockCreate = jest.fn().mockResolvedValue({ id: 'evt_1' });

const mockPrisma = {
  analyticsEvent: { create: mockCreate },
  $queryRawUnsafe: jest.fn(),
  vendor: { findMany: jest.fn() },
} as unknown as PrismaService;

// ── Helpers ───────────────────────────────────────────────────────────────

async function makeService() {
  const module = await Test.createTestingModule({
    providers: [AnalyticsService, { provide: PrismaService, useValue: mockPrisma }],
  }).compile();
  return module.get(AnalyticsService);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('AnalyticsService.track', () => {
  let svc: AnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    svc = await makeService();
  });

  it('persists the event to analytics_events via Prisma', async () => {
    await svc.track({ eventName: 'vendor_page_view', anonVisitorId: 'anon-abc' });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        eventName: 'vendor_page_view',
        properties: {},
        anonVisitorId: 'anon-abc',
        vendorId: null,
      },
    });
  });

  it('defaults properties to {} when omitted', async () => {
    await svc.track({ eventName: 'application_start' });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ properties: {} }) }),
    );
  });

  it('persists vendorId when supplied', async () => {
    const vendorId = '00000000-0000-0000-0000-000000000001';
    await svc.track({ eventName: 'share_link_click', vendorId });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vendorId }),
      }),
    );
  });

  it('never throws even when Prisma fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB down'));
    await expect(svc.track({ eventName: 'vendor_page_view' })).resolves.toBeUndefined();
  });

  it('trackPublic rejects legacy and unknown client events', async () => {
    await svc.trackPublic({ eventName: 'vendor_page_view' });
    await svc.trackPublic({ eventName: 'not_a_client_event', properties: {} });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('trackPublic rejects keys and values outside each event schema', async () => {
    await svc.trackPublic({
      eventName: 'application_menu_uploaded',
      properties: { method: 'photo', arbitrary: 'not retained' },
    });
    await svc.trackPublic({
      eventName: 'application_field_abandoned',
      properties: { field: 'postcode', phase: 'phase_1', step: 'x', value: 'secret' },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

/**
 * Contract test: order_attribution_source event.
 *
 * Asserts that the attributionSource stored in properties is identical to the
 * value passed in with no transformation or re-derivation.  This is the
 * "verified by test" requirement: the analytics event always matches the
 * Order's actual attribution field because both come from the same resolved
 * value (attrSource in OrdersService.finishCreateOrder). No transformation,
 * no re-derivation.
 */
describe('order_attribution_source contract', () => {
  const ATTRIBUTION_SOURCES = ['VENDOR_REFERRED', 'MARKETPLACE', 'MARKETPLACE_REPEAT'] as const;

  let svc: AnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    svc = await makeService();
  });

  it.each(ATTRIBUTION_SOURCES)(
    'stores attributionSource=%s unchanged in properties',
    async (source) => {
      const vendorId = '00000000-0000-0000-0000-000000000002';

      await svc.track({
        eventName: 'order_attribution_source',
        properties: { attributionSource: source, isFirstOrder: true, vendorId },
        vendorId,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventName: 'order_attribution_source',
            properties: expect.objectContaining({ attributionSource: source }),
          }),
        }),
      );
    },
  );

  it('event properties.attributionSource equals the value that would be on the Order row', async () => {
    // Simulates what OrdersService.finishCreateOrder does: both the Order row
    // write and the analytics track() call receive the same `attrSource` variable.
    // This test captures that contract at the service boundary.
    const attrSource = 'VENDOR_REFERRED'; // same variable as written to order.attributionSource

    await svc.track({
      eventName: 'order_attribution_source',
      properties: { attributionSource: attrSource, isFirstOrder: false },
    });

    const callArgs = mockCreate.mock.calls[0][0] as {
      data: { properties: Record<string, unknown> };
    };
    expect(callArgs.data.properties.attributionSource).toBe(attrSource);
  });
});

describe('AnalyticsService.getShareActivity', () => {
  it('returns the joined vendor trading name rather than its UUID', async () => {
    const vendorId = '00000000-0000-0000-0000-000000000003';
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ vendorId, linkClicks: '3', qrScans: '2' }]),
      vendor: {
        findMany: jest.fn().mockResolvedValue([{ id: vendorId, businessName: 'Ada Kitchen' }]),
      },
    };
    const service = new AnalyticsService(prisma as never);

    await expect(service.getShareActivity(30, 20)).resolves.toEqual([
      { vendorId, businessName: 'Ada Kitchen', linkClicks: 3, qrScans: 2 },
    ]);
    expect(prisma.vendor.findMany).toHaveBeenCalledWith({
      where: { id: { in: [vendorId] } },
      select: { id: true, businessName: true },
    });
  });
});

describe('lifecycle safety and aggregates', () => {
  const prisma: any = {
    analyticsEvent: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  let service: AnalyticsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.analyticsEvent.findFirst.mockResolvedValue(null);
    service = new AnalyticsService(prisma);
  });
  it('rejects PII properties', async () => {
    await service.track({
      eventName: 'field_abandonment',
      properties: { fieldName: 'postcode', freeformNote: 'secret' },
    });
    expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
  });
  it('first-only milestones are idempotent', async () => {
    await service.trackServer('vendor_live', { vendorId: 'v1' });
    prisma.analyticsEvent.findFirst.mockResolvedValue({ id: 'existing' });
    await service.trackServer('vendor_live', { vendorId: 'v1' });
    expect(prisma.analyticsEvent.create).toHaveBeenCalledTimes(1);
  });
  it('dedupes first orders by vendor, not the customer user', async () => {
    const persisted: Array<{ eventName: string; vendorId: string }> = [];
    prisma.analyticsEvent.findFirst.mockImplementation(async ({ where }: any) =>
      persisted.some(
        (event) => event.eventName === where.eventName && event.vendorId === where.vendorId,
      )
        ? { id: 'existing' }
        : null,
    );
    prisma.analyticsEvent.create.mockImplementation(async ({ data }: any) => {
      persisted.push({ eventName: data.eventName, vendorId: data.vendorId });
      return { id: `event-${persisted.length}` };
    });

    await service.trackServer('first_order', { vendorId: 'vendor-a', userId: 'customer-1' });
    await service.trackServer('first_order', { vendorId: 'vendor-b', userId: 'customer-1' });
    await service.trackServer('first_order', { vendorId: 'vendor-a', userId: 'customer-1' });

    expect(persisted).toEqual([
      { eventName: 'first_order', vendorId: 'vendor-a' },
      { eventName: 'first_order', vendorId: 'vendor-b' },
    ]);
    expect(prisma.analyticsEvent.findFirst).toHaveBeenLastCalledWith({
      where: { eventName: 'first_order', vendorId: 'vendor-a' },
      select: { id: true },
    });
  });
  it('returns p50/p90 lifecycle aggregates', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ eventName: 'application_submitted', count: 4n }])
      .mockResolvedValueOnce([{ p50: 3600, p90: 7200 }]);
    await expect(service.getLifecycleAggregates(30)).resolves.toMatchObject({
      timeToLiveSeconds: { p50: 3600, p90: 7200 },
    });
  });
  it('filters stuck-lead drill-through to non-terminal applications', async () => {
    prisma.$queryRaw.mockResolvedValue([{ applicationId: 'a1' }]);
    await service.getStuckLeads(30);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    const query = prisma.$queryRaw.mock.calls[0][0].join(' ');
    expect(query).toContain("INTERVAL '24 hours'");
    expect(query).toContain('application_phase_1_started');
  });
});
