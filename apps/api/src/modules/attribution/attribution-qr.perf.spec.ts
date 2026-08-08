/**
 * Performance smoke test: verifies that the referral QR code is generated
 * synchronously inside getOrCreateLink, so the very first API response
 * already contains qrUrls (no polling required).
 *
 * Budget: 5 000 ms total for QR generation + Supabase Storage upload,
 * matching the acceptance criterion of "QR visible within 5 s on a
 * throttled connection" (storage latency dominates, not the render).
 *
 * The test mocks Supabase Storage so it resolves immediately and focuses
 * on verifying the synchronous contract rather than storage round-trip
 * time. A separate integration test (run against staging) covers end-to-end
 * latency.
 */

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AttributionService } from './attribution.service';

describe('AttributionService - QR performance contract', () => {
  let service: AttributionService;

  const VENDOR_ID = 'vendor-uuid-001';
  const LINK_ID = 'link-uuid-001';
  const SLUG = 'test-vendor-abc123';
  const PNG_URL = 'https://cdn.example.com/referral-qr/link-uuid-001/qr.png';
  const SVG_URL = 'https://cdn.example.com/referral-qr/link-uuid-001/qr.svg';

  beforeEach(async () => {
    const mockStorage = {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockImplementation((path: string) => ({
          data: { publicUrl: path.endsWith('.png') ? PNG_URL : SVG_URL },
        })),
      }),
    };

    const mockSupabaseClient = { storage: mockStorage };

    const mockPrisma = {
      vendorReferralLink: {
        findUnique: jest.fn().mockResolvedValue(null), // no existing link
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: LINK_ID,
          vendorId: VENDOR_ID,
          slug: SLUG,
          qrCodeUrl: null,
          createdAt: new Date(),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      vendor: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          businessName: 'Test Vendor',
          slug: 'test-vendor',
        }),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        AttributionService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: SupabaseService,
          useValue: { getClient: () => mockSupabaseClient },
        },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://feastpot.co.uk' },
        },
      ],
    }).compile();

    service = module.get(AttributionService);
  });

  it('getOrCreateLink returns qrUrls synchronously (no fire-and-forget)', async () => {
    jest.setTimeout(5_000); // hard 5 s budget

    const start = performance.now();
    const result = await service.getOrCreateLink(VENDOR_ID);
    const elapsed = performance.now() - start;

    // QR must be present in the first response.
    expect(result.qrUrls).not.toBeNull();
    expect(result.qrUrls?.png).toBe(PNG_URL);
    expect(result.qrUrls?.svg).toBe(SVG_URL);

    // Must complete within 5 000 ms (with mocked storage, this is well under 1 s;
    // the budget accounts for real Supabase Storage latency in staging runs).
    expect(elapsed).toBeLessThan(5_000);
  }, 5_000);

  it('getOrCreateLink returns qrUrls: null gracefully when storage fails', async () => {
    // Simulate Supabase Storage being unavailable.
    const failingStorageMock = {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: { message: 'Bucket not found' } }),
        getPublicUrl: jest.fn(),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        AttributionService,
        {
          provide: PrismaService,
          useValue: {
            vendorReferralLink: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: LINK_ID,
                vendorId: VENDOR_ID,
                slug: SLUG,
                qrCodeUrl: null,
                createdAt: new Date(),
              }),
              update: jest.fn(),
            },
            vendor: {
              findUniqueOrThrow: jest.fn().mockResolvedValue({
                businessName: 'Test Vendor',
                slug: 'test-vendor',
              }),
            },
          },
        },
        {
          provide: SupabaseService,
          useValue: { getClient: () => ({ storage: failingStorageMock }) },
        },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://feastpot.co.uk' },
        },
      ],
    }).compile();

    const svc = module.get(AttributionService);
    const result = await svc.getOrCreateLink(VENDOR_ID);

    // Page must still render; client uses browser-side fallback QR.
    expect(result).toBeDefined();
    expect(result.qrUrls).toBeNull();
    expect(result.referralUrl).toContain('/v/');
  });

  it('backfillMissingQr processes links with null qrCodeUrl', async () => {
    // Spy on generateAndStoreQr so we test backfill orchestration without
    // running actual CPU-intensive QR renders inside the test suite.
    const spy = jest
      .spyOn(service, 'generateAndStoreQr')
      .mockResolvedValue({ png: 'https://cdn.example.com/qr.png', svg: 'https://cdn.example.com/qr.svg' });

    // Inject mock findMany returning 2 links that need QR generation.
    const prismaAny = service['prisma'] as Record<string, unknown>;
    const origFindMany = (prismaAny['vendorReferralLink'] as Record<string, unknown>)['findMany'];
    (prismaAny['vendorReferralLink'] as Record<string, unknown>)['findMany'] = jest.fn().mockResolvedValue([
      { id: 'link-a', slug: 'vendor-a-abc' },
      { id: 'link-b', slug: 'vendor-b-def' },
    ]);

    const result = await service.backfillMissingQr();

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('link-a', 'vendor-a-abc');
    expect(spy).toHaveBeenCalledWith('link-b', 'vendor-b-def');

    // Restore originals.
    spy.mockRestore();
    (prismaAny['vendorReferralLink'] as Record<string, unknown>)['findMany'] = origFindMany;
  });
});
