// Hoist: mock qrcode before the controller module imports it.
jest.mock('qrcode', () => ({
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-png-data')),
  toString: jest.fn().mockResolvedValue('<svg>fake-svg</svg>'),
}));

import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../catalogue/supabase-storage.service';

import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

/**
 * Pins down the diagnostic GET /v1/vendors/debug endpoint and the
 * `debug` vs `:id` route-ordering fix it depends on.
 *
 * Why this spec exists: `debug` is a literal segment that must be
 * declared on the controller BEFORE the UUID-validated `@Get(':id')`
 * route, otherwise Nest matches "debug" against `/:id` and the global
 * ParseUUIDPipe 400s with "Validation failed (uuid is expected)" - the
 * exact regression that prompted adding /vendors/debug. A re-order of
 * the decorators in vendors.controller.ts would silently bring that bug
 * back without this spec.
 */

const mockDebugResult = {
  liveVendorCount: 3,
  deliveryConfigCount: 2,
  configsWithCoordinates: 0,
  sampleVendors: [
    {
      id: 'v-1',
      businessName: 'Maman Kitchen',
      status: 'live',
      hasDeliveryConfig: true,
      hasCoordinates: false,
      deliveryRadiusMiles: 5,
    },
  ],
  postcodeTest: null as null | {
    postcode: string;
    geocoded: { lat: number; lng: number } | null;
    vendorsInRadius: number;
    vendorsWithNoLocation: number;
  },
  apiUrlSetInEnv: true,
  nextPublicApiUrl: 'https://api.example.com',
};

describe('VendorsController (HTTP) - debug endpoint + route ordering', () => {
  let app: INestApplication;
  let getDebugInfo: jest.Mock;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    getDebugInfo = jest.fn();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [VendorsController],
      providers: [
        {
          provide: VendorsService,
          // Only debug() is exercised here; other methods are stubbed
          // out so the controller can be constructed without dragging in
          // Prisma / Stripe / Notifications.
          useValue: {
            getDebugInfo,
            findById: jest.fn(),
            search: jest.fn(),
            findBySlug: jest.fn(),
          },
        },
        { provide: SupabaseStorageService, useValue: {} },
        // Injected for the capacity data-layer merge on GET :id/availability;
        // not exercised by these tests.
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts so the URI version prefix and DTO validation
    // (which is what produces the 400 on a non-UUID :id) behave the
    // same as production.
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env.NODE_ENV = originalNodeEnv;
  });

  beforeEach(() => {
    getDebugInfo.mockReset();
    // Ensure NODE_ENV is non-prod for the happy-path tests; the prod
    // test overrides it explicitly.
    process.env.NODE_ENV = 'test';
  });

  it('GET /v1/vendors/debug returns 200 with the exact diagnostic field set (no postcode)', async () => {
    getDebugInfo.mockResolvedValueOnce({ ...mockDebugResult, postcodeTest: null });

    const res = await request(app.getHttpServer()).get('/v1/vendors/debug').expect(200);

    expect(getDebugInfo).toHaveBeenCalledWith(undefined);
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'liveVendorCount',
        'deliveryConfigCount',
        'configsWithCoordinates',
        'sampleVendors',
        'postcodeTest',
        'apiUrlSetInEnv',
        'nextPublicApiUrl',
      ].sort(),
    );
    expect(res.body.postcodeTest).toBeNull();
    expect(res.body.liveVendorCount).toBe(3);
    expect(res.body.apiUrlSetInEnv).toBe(true);
  });

  it('GET /v1/vendors/debug?postcode=SE15 populates postcodeTest and forwards the postcode to the service', async () => {
    getDebugInfo.mockResolvedValueOnce({
      ...mockDebugResult,
      postcodeTest: {
        postcode: 'SE15',
        geocoded: { lat: 51.4694, lng: -0.0694 },
        vendorsInRadius: 0,
        vendorsWithNoLocation: 3,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/vendors/debug')
      .query({ postcode: 'SE15' })
      .expect(200);

    expect(getDebugInfo).toHaveBeenCalledWith('SE15');
    expect(res.body.postcodeTest).toEqual({
      postcode: 'SE15',
      geocoded: { lat: 51.4694, lng: -0.0694 },
      vendorsInRadius: 0,
      vendorsWithNoLocation: 3,
    });
  });

  it('GET /v1/vendors/debug returns 404 when NODE_ENV === "production"', async () => {
    process.env.NODE_ENV = 'production';
    await request(app.getHttpServer()).get('/v1/vendors/debug').expect(404);
    // Service must NOT be reached - the controller short-circuits before
    // even attempting the diagnostic read in prod.
    expect(getDebugInfo).not.toHaveBeenCalled();
  });

  it('GET /v1/vendors/:id with a non-UUID value still returns 400 (UUID guard did not regress)', async () => {
    // "not-a-uuid" must hit the UUID-validated `/:id` route, NOT `debug`.
    // If route ordering ever breaks again, this would 404 instead of 400.
    await request(app.getHttpServer()).get('/v1/vendors/not-a-uuid').expect(400);
  });
});

/**
 * Unit tests for VendorsController.myQrCode (GET /v1/vendors/me/qr).
 *
 * We call the controller method directly rather than via supertest so we can:
 *  - inject a mock Response without wiring up the full Nest HTTP adapter
 *  - skip the auth-guard layer (which is separately exercised by E2E tests)
 *  - verify the CORE security invariant: vendor is ALWAYS resolved from the
 *    authenticated user.id, never from a request parameter.
 *
 * qrcode is mocked at the top of this file (jest.mock hoisting) so no real
 * QR generation happens and assertions are deterministic.
 */
describe('VendorsController.myQrCode - auth-scoped QR generation', () => {
  let controller: VendorsController;
  let vendorFindUnique: jest.Mock;
  let referralLinkFindUnique: jest.Mock;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeUser = (id: string) => ({ id, role: 'vendor' }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeRes = () => ({ setHeader: jest.fn(), send: jest.fn() }) as any;

  beforeEach(async () => {
    vendorFindUnique = jest.fn();
    referralLinkFindUnique = jest.fn();
    jest.clearAllMocks();
    // Default: referral link exists and resolves cleanly. Individual tests
    // override this when testing the missing-referral-link error path.
    referralLinkFindUnique.mockResolvedValue({ slug: 'mamas-kitchen-ref' });

    const module = await Test.createTestingModule({
      controllers: [VendorsController],
      providers: [
        {
          provide: VendorsService,
          useValue: {
            getDebugInfo: jest.fn(),
            findById: jest.fn(),
            search: jest.fn(),
            findBySlug: jest.fn(),
          },
        },
        { provide: SupabaseStorageService, useValue: {} },
        {
          provide: PrismaService,
          useValue: {
            vendor: { findUnique: vendorFindUnique },
            vendorReferralLink: { findUnique: referralLinkFindUnique },
          },
        },
      ],
    }).compile();

    controller = module.get(VendorsController);
  });

  it('resolves the vendor strictly by authenticated user.id and never by a slug param', async () => {
    vendorFindUnique.mockResolvedValue({ slug: 'mamas-kitchen', id: 'vendor-1' });

    await controller.myQrCode(makeUser('user-abc'), undefined, makeRes());

    expect(vendorFindUnique).toHaveBeenCalledTimes(1);
    expect(vendorFindUnique).toHaveBeenCalledWith({
      where: { userId: 'user-abc' },
      select: { slug: true, id: true },
    });
    // Critically: no slug/id parameter should appear as a `where` key.
    const whereArg = vendorFindUnique.mock.calls[0][0].where as Record<string, unknown>;
    expect(Object.keys(whereArg)).toEqual(['userId']);
  });

  it('throws NotFoundException (VENDOR_NOT_FOUND) when the user has no vendor record', async () => {
    vendorFindUnique.mockResolvedValue(null);

    await expect(
      controller.myQrCode(makeUser('user-no-vendor'), undefined, makeRes()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException (REFERRAL_LINK_NOT_FOUND) when vendor has no referral link yet', async () => {
    vendorFindUnique.mockResolvedValue({ slug: 'mamas-kitchen', id: 'vendor-1' });
    referralLinkFindUnique.mockResolvedValue(null);

    await expect(
      controller.myQrCode(makeUser('user-abc'), undefined, makeRes()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sends a PNG buffer with image/png Content-Type by default (no format param)', async () => {
    vendorFindUnique.mockResolvedValue({ slug: 'mamas-kitchen', id: 'vendor-1' });
    const res = makeRes();

    await controller.myQrCode(makeUser('user-abc'), undefined, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    // The mocked QRCode.toBuffer resolves to Buffer.from('fake-png-data')
    expect(res.send).toHaveBeenCalledWith(Buffer.from('fake-png-data'));
  });

  it('sends SVG string with image/svg+xml Content-Type when format=svg', async () => {
    vendorFindUnique.mockResolvedValue({ slug: 'mamas-kitchen', id: 'vendor-1' });
    const res = makeRes();

    await controller.myQrCode(makeUser('user-abc'), 'svg', res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/svg+xml');
    expect(res.send).toHaveBeenCalledWith('<svg>fake-svg</svg>');
  });

  it('embeds the referral-link slug (not Vendor.slug) in the QR so attribution is preserved', async () => {
    // The QR must encode VendorReferralLink.slug so the /v/[slug] click recorder
    // resolves it and sets fp_ref. Using Vendor.slug when the two differ produces a
    // URL that records no click, silently attributing the order as marketplace (12%).
    // ?src=vendor must NOT appear: the route handler ignores it, so it is misleading.
    const vendorSlug = "mama's kitchen"; // display slug - must NOT appear in QR URL
    const referralSlug = 'mamas-kitchen-ref'; // attribution slug - MUST appear in QR URL
    vendorFindUnique.mockResolvedValue({ slug: vendorSlug, id: 'vendor-1' });
    referralLinkFindUnique.mockResolvedValue({ slug: referralSlug });
    const res = makeRes();

    await controller.myQrCode(makeUser('user-abc'), undefined, res);

    const qrcode = await import('qrcode');
    const toBuffer = qrcode.toBuffer as jest.Mock;
    const calledUrl = toBuffer.mock.calls[toBuffer.mock.calls.length - 1][0] as string;
    // Referral-link slug, URL-encoded, no ?src=vendor.
    expect(calledUrl).toBe(`https://feastpot.co.uk/v/${encodeURIComponent(referralSlug)}`);
    // Vendor display slug must not appear anywhere in the QR URL.
    expect(calledUrl).not.toContain(encodeURIComponent(vendorSlug));
  });
});
