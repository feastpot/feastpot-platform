/**
 * Attribution logic unit tests.
 *
 * Covers the five spec acceptance criteria:
 *   AC-1  parseFpRef rejects values older than 30 days (VENDOR window).
 *   AC-2  parseFpMktp rejects values older than 90 days (MARKETPLACE window).
 *   AC-3  MARKETPLACE marker (90-day) beats a concurrent VENDOR marker -
 *         the override rule that protects platform attribution.
 *   AC-4  When only a VENDOR marker is present, source resolves to VENDOR_REFERRED.
 *   AC-5  toResolvedSource correctly derives the three-tier label from
 *         (OrderSource, isFirstOrder) - including MARKETPLACE_REPEAT for second orders.
 */

import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OrderSource } from '@prisma/client';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ATTRIBUTION_QR_QUEUE } from '../../queues/queues.module';

import {
  AttributionService,
  buildFpRef,
  parseFpMktp,
  parseFpRef,
  toResolvedSource,
} from './attribution.service';

// ── Pure-function tests (no DB) ───────────────────────────────────────────────

describe('parseFpRef', () => {
  const VENDOR_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

  it('parses a well-formed, in-window fp_ref cookie', () => {
    const ts = Date.now();
    const raw = `link-id|click-id|${ts}`;
    const result = parseFpRef(raw);
    expect(result).not.toBeNull();
    expect(result?.referralLinkId).toBe('link-id');
    expect(result?.clickId).toBe('click-id');
    expect(result?.ts).toBe(ts);
  });

  it('returns null for an expired fp_ref (older than 30 days) - AC-1', () => {
    const expiredTs = Date.now() - VENDOR_WINDOW_MS - 1;
    const raw = `link-id|click-id|${expiredTs}`;
    expect(parseFpRef(raw)).toBeNull();
  });

  it('accepts a fp_ref exactly at the 30-day boundary (not yet expired)', () => {
    const ts = Date.now() - VENDOR_WINDOW_MS + 5_000; // 5s before expiry
    const raw = `link-id|click-id|${ts}`;
    expect(parseFpRef(raw)).not.toBeNull();
  });

  it('returns null for null / undefined input', () => {
    expect(parseFpRef(null)).toBeNull();
    expect(parseFpRef(undefined)).toBeNull();
    expect(parseFpRef('')).toBeNull();
  });

  it('returns null for malformed values (wrong segment count)', () => {
    expect(parseFpRef('only-two|parts')).toBeNull();
    expect(parseFpRef('a|b|c|d')).toBeNull();
  });

  it('returns null when the timestamp segment is not a number', () => {
    expect(parseFpRef('link-id|click-id|not-a-number')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('parseFpMktp', () => {
  const MARKETPLACE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

  it('parses a valid marketplace marker timestamp', () => {
    const ts = Date.now() - 1_000;
    expect(parseFpMktp(String(ts))).toBe(ts);
  });

  it('returns null for an expired marker (older than 90 days) - AC-2', () => {
    const expired = Date.now() - MARKETPLACE_WINDOW_MS - 1;
    expect(parseFpMktp(String(expired))).toBeNull();
  });

  it('accepts a marker exactly at the 90-day boundary (not yet expired)', () => {
    const ts = Date.now() - MARKETPLACE_WINDOW_MS + 5_000;
    expect(parseFpMktp(String(ts))).toBe(ts);
  });

  it('returns null for null / undefined / empty input', () => {
    expect(parseFpMktp(null)).toBeNull();
    expect(parseFpMktp(undefined)).toBeNull();
    expect(parseFpMktp('')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseFpMktp('not-a-number')).toBeNull();
    expect(parseFpMktp('abc')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('toResolvedSource - AC-5', () => {
  it('maps VENDOR_REFERRED to VENDOR_REFERRED regardless of isFirstOrder', () => {
    expect(toResolvedSource(OrderSource.VENDOR_REFERRED, true)).toBe('VENDOR_REFERRED');
    expect(toResolvedSource(OrderSource.VENDOR_REFERRED, false)).toBe('VENDOR_REFERRED');
  });

  it('maps MARKETPLACE + isFirstOrder=true to MARKETPLACE_FIRST', () => {
    expect(toResolvedSource(OrderSource.MARKETPLACE, true)).toBe('MARKETPLACE_FIRST');
  });

  it('maps MARKETPLACE + isFirstOrder=false to MARKETPLACE_REPEAT - AC-5 (second order)', () => {
    expect(toResolvedSource(OrderSource.MARKETPLACE, false)).toBe('MARKETPLACE_REPEAT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildFpRef', () => {
  it('produces a parseable fp_ref value', () => {
    const raw = buildFpRef('link-1', 'click-1');
    const parsed = parseFpRef(raw);
    expect(parsed?.referralLinkId).toBe('link-1');
    expect(parsed?.clickId).toBe('click-1');
  });
});

// ── AttributionService.preResolveSource ───────────────────────────────────────

describe('AttributionService.preResolveSource', () => {
  let service: AttributionService;
  let prisma: jest.Mocked<PrismaService>;

  const VENDOR_ID = 'vendor-uuid-001';
  const CUSTOMER_ID = 'customer-uuid-001';
  const LINK_ID = 'link-uuid-001';
  const CLICK_ID = 'click-uuid-001';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AttributionService,
        {
          provide: PrismaService,
          useValue: {
            vendorReferralLink: { findUnique: jest.fn() },
            referralClick: { findFirst: jest.fn() },
            order: { findFirst: jest.fn() },
          },
        },
        {
          provide: SupabaseService,
          useValue: { getClient: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('https://feastpot.co.uk') },
        },
        {
          provide: getQueueToken(ATTRIBUTION_QR_QUEUE),
          useValue: { add: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AttributionService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;

    // Default: no prior delivered order (isFirstOrder=true)
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);
  });

  // AC-3: MARKETPLACE marker (90-day) beats VENDOR marker (30-day)
  it('resolves to MARKETPLACE when a valid MARKETPLACE marker is present, even if fp_ref is also set - AC-3 override rule', async () => {
    // Provide a valid fp_ref (vendor referral) ...
    const fpRef = buildFpRef(LINK_ID, CLICK_ID);
    // ... and a valid marketplace marker
    const marketplaceMarker = String(Date.now() - 1_000);

    // vendorReferralLink.findUnique should NOT be called (marketplace wins before we check)
    const linkFindSpy = prisma.vendorReferralLink.findUnique as jest.Mock;

    const result = await service.preResolveSource(
      fpRef,
      undefined,
      CUSTOMER_ID,
      VENDOR_ID,
      marketplaceMarker,
    );

    expect(result.source).toBe(OrderSource.MARKETPLACE);
    // Override rule short-circuits before querying the link table.
    expect(linkFindSpy).not.toHaveBeenCalled();
  });

  // AC-3: expired marketplace marker should NOT override a valid vendor marker
  it('falls through to VENDOR_REFERRED when the MARKETPLACE marker is expired - AC-3 (expired override)', async () => {
    const MARKETPLACE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
    const expiredMktplace = String(Date.now() - MARKETPLACE_WINDOW_MS - 1);
    const fpRef = buildFpRef(LINK_ID, CLICK_ID);

    (prisma.vendorReferralLink.findUnique as jest.Mock).mockResolvedValue({
      id: LINK_ID,
      vendorId: VENDOR_ID,
    });

    const result = await service.preResolveSource(
      fpRef,
      undefined,
      CUSTOMER_ID,
      VENDOR_ID,
      expiredMktplace,
    );

    expect(result.source).toBe(OrderSource.VENDOR_REFERRED);
  });

  // AC-4: vendor-only yields VENDOR_REFERRED
  it('resolves to VENDOR_REFERRED when fp_ref matches the correct vendor and no marketplace marker - AC-4', async () => {
    const fpRef = buildFpRef(LINK_ID, CLICK_ID);
    (prisma.vendorReferralLink.findUnique as jest.Mock).mockResolvedValue({
      id: LINK_ID,
      vendorId: VENDOR_ID,
    });

    const result = await service.preResolveSource(fpRef, undefined, CUSTOMER_ID, VENDOR_ID);

    expect(result.source).toBe(OrderSource.VENDOR_REFERRED);
    expect(result.isFirstOrder).toBe(true);
  });

  it('resolves to MARKETPLACE when fp_ref belongs to a different vendor (cross-vendor)', async () => {
    const fpRef = buildFpRef(LINK_ID, CLICK_ID);
    (prisma.vendorReferralLink.findUnique as jest.Mock).mockResolvedValue({
      id: LINK_ID,
      vendorId: 'other-vendor-uuid',
    });

    const result = await service.preResolveSource(fpRef, undefined, CUSTOMER_ID, VENDOR_ID);

    expect(result.source).toBe(OrderSource.MARKETPLACE);
  });

  it('resolves to MARKETPLACE (organic) when no markers are present', async () => {
    const result = await service.preResolveSource(undefined, undefined, CUSTOMER_ID, VENDOR_ID);
    expect(result.source).toBe(OrderSource.MARKETPLACE);
    expect(result.isFirstOrder).toBe(true);
  });

  // AC-5: second order sets isFirstOrder=false, leading to MARKETPLACE_REPEAT
  it('sets isFirstOrder=false when a prior delivered order exists - leads to MARKETPLACE_REPEAT - AC-5', async () => {
    // Simulate a prior delivered order
    (prisma.order.findFirst as jest.Mock).mockResolvedValue({ id: 'prior-order-id' });

    const result = await service.preResolveSource(undefined, undefined, CUSTOMER_ID, VENDOR_ID);

    expect(result.source).toBe(OrderSource.MARKETPLACE);
    expect(result.isFirstOrder).toBe(false);
    // Derived label: MARKETPLACE + isFirstOrder=false yields MARKETPLACE_REPEAT
    expect(toResolvedSource(result.source, result.isFirstOrder)).toBe('MARKETPLACE_REPEAT');
  });

  it('defaults to MARKETPLACE/first on DB error (never throws)', async () => {
    (prisma.order.findFirst as jest.Mock).mockRejectedValue(new Error('DB error'));
    (prisma.vendorReferralLink.findUnique as jest.Mock).mockRejectedValue(new Error('DB error'));

    const result = await service.preResolveSource(
      buildFpRef(LINK_ID, CLICK_ID),
      undefined,
      CUSTOMER_ID,
      VENDOR_ID,
    );

    expect(result.source).toBe(OrderSource.MARKETPLACE);
    expect(result.isFirstOrder).toBe(true);
  });
});
