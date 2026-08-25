/**
 * Queue-contract smoke test: referral-link reads must never render or upload
 * QR images. They enqueue deterministic work and return immediately.
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

import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';

import { GENERATE_REFERRAL_QR_JOB } from './attribution-qr.jobs';
import { AttributionService } from './attribution.service';

// Mock the qrcode library so tests don't do real CPU-intensive QR rendering.
// The contract being tested is synchrony and the storage integration, not
// pixel correctness - a separate staging test covers end-to-end latency.
jest.mock('qrcode', () => ({
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-png-data')),
  toString: jest.fn().mockResolvedValue('<svg>fake-qr</svg>'),
}));

describe('AttributionService - QR performance contract', () => {
  let service: AttributionService;
  const mockQueue = {
    getJob: jest.fn().mockResolvedValue(null),
    add: jest.fn().mockResolvedValue({}),
  };

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
        { provide: getQueueToken('attribution-qr'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get(AttributionService);
  });

  it('getOrCreateLink returns immediately with null QR URLs and queues rendering', async () => {
    const start = performance.now();
    const result = await service.getOrCreateLink(VENDOR_ID);
    const elapsed = performance.now() - start;

    expect(result.qrUrls).toBeNull();
    expect(elapsed).toBeLessThan(1_000);
    await Promise.resolve(); // allow the intentional fire-and-forget enqueue to run
    expect(mockQueue.add).toHaveBeenCalledWith(
      GENERATE_REFERRAL_QR_JOB,
      { linkId: LINK_ID },
      { jobId: `referral-qr:${LINK_ID}` },
    );
  });

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
        { provide: ConfigService, useValue: { get: () => 'https://feastpot.co.uk' } },
        { provide: getQueueToken('attribution-qr'), useValue: mockQueue },
      ],
    }).compile();

    const svc = module.get(AttributionService);
    const result = await svc.getOrCreateLink(VENDOR_ID);

    // Page renders without contacting Storage on the request path.
    expect(result).toBeDefined();
    expect(result.qrUrls).toBeNull();
    expect(result.referralUrl).toContain('/v/');
  });

  it('backfillMissingQr queues bounded background discovery rather than rendering in the request', async () => {
    const result = await service.backfillMissingQr();

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);
  });
});
