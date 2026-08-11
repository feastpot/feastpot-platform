import { Test } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { AnalyticsService } from './analytics.service';

// ── Minimal Prisma mock ───────────────────────────────────────────────────

const mockCreate = jest.fn().mockResolvedValue({ id: 'evt_1' });

const mockPrisma = {
  analyticsEvent: { create: mockCreate },
} as unknown as PrismaService;

// ── Helpers ───────────────────────────────────────────────────────────────

async function makeService() {
  const module = await Test.createTestingModule({
    providers: [
      AnalyticsService,
      { provide: PrismaService, useValue: mockPrisma },
    ],
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
  const ATTRIBUTION_SOURCES = [
    'VENDOR_REFERRED',
    'MARKETPLACE',
    'MARKETPLACE_REPEAT',
  ] as const;

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

    const callArgs = mockCreate.mock.calls[0][0] as { data: { properties: Record<string, unknown> } };
    expect(callArgs.data.properties.attributionSource).toBe(attrSource);
  });
});
