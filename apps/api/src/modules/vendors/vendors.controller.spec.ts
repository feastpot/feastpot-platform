import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

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
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts so the URI version prefix and DTO validation
    // (which is what produces the 400 on a non-UUID :id) behave the
    // same as production.
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
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
