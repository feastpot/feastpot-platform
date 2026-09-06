import { INestApplication, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';

import { TestDataFactory, type TestIdentity } from '../../../../scripts/test-factory';
import { RoleThrottlerGuard } from '../common/guards/role-throttler.guard';
import { AdminController } from '../modules/admin/admin.controller';
import { STRIPE_CLIENT } from '../stripe/stripe.service';

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const REQUIRED_ENV = [
  'SUPABASE_DB_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_FACTORY_PASSWORD',
] as const;
const missing = [
  ...REQUIRED_ENV.filter((key) => !process.env[key]),
  ...(ANON_KEY ? [] : ['SUPABASE_ANON_KEY']),
];
const d = missing.length ? describe.skip : describe;

type AdminRoute = { method: RequestMethod; path: string };

/**
 * Keep the endpoint inventory coupled to the controller decorators, but make
 * a real authenticated HTTP request for every discovered route. Parameter
 * values only need to be syntactically valid because RolesGuard runs before
 * validation or the controller body for vendor/customer callers.
 */
function adminRoutes(): AdminRoute[] {
  const prefix = Reflect.getMetadata(PATH_METADATA, AdminController) as string;
  return Object.getOwnPropertyNames(AdminController.prototype)
    .filter((name) => name !== 'constructor')
    .flatMap((name) => {
      const handler = AdminController.prototype[name as keyof AdminController] as unknown;
      if (typeof handler !== 'function') return [];
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (method === undefined || path === undefined) return [];
      return [{ method, path: `/v1/${prefix}/${path}`.replace(/\/+/g, '/') }];
    });
}

function concretePath(path: string): string {
  return path.replace(/:[^/]+/g, '00000000-0000-4000-8000-000000000001');
}

function call(app: INestApplication, method: RequestMethod, path: string, token: string) {
  const client = request(app.getHttpServer());
  const authorized = (test: ReturnType<typeof request>) =>
    test.set('Authorization', `Bearer ${token}`);
  switch (method) {
    case RequestMethod.GET:
      return authorized(client.get(path));
    case RequestMethod.POST:
      return authorized(client.post(path));
    case RequestMethod.PUT:
      return authorized(client.put(path));
    case RequestMethod.PATCH:
      return authorized(client.patch(path));
    case RequestMethod.DELETE:
      return authorized(client.delete(path));
    default:
      throw new Error(`Unsupported HTTP method in admin route inventory: ${method}`);
  }
}

d('S6 role-matrix acceptance (real factory JWTs)', () => {
  let app: INestApplication;
  let factory: TestDataFactory;
  let customer: TestIdentity;
  let vendorA: TestIdentity;
  let vendorWithOrder: TestIdentity;
  let vendorWithDocument: TestIdentity;
  let customerWithDispute: TestIdentity;
  let aal1Admin: TestIdentity;
  let aal2Admin: TestIdentity;
  let customerToken: string;
  let vendorAToken: string;
  let aal1Token: string;
  let previousAalRequirement: string | undefined;

  beforeAll(async () => {
    factory = TestDataFactory.fromEnvironment({ namespace: `s6-role-matrix-${Date.now()}` });
    // Creation is deliberately serial: A2 signs in and enrols MFA through the
    // factory's shared Supabase browser client, which must not race another
    // fixture's Auth work.
    customer = await factory.create('C1');
    vendorA = await factory.create('V4');
    vendorWithOrder = await factory.create('V5');
    vendorWithDocument = await factory.create('V6');
    customerWithDispute = await factory.create('C6');
    aal1Admin = await factory.create('A1');
    // A1 and A2 intentionally reuse the globally current admin fixture.
    // Capture the AAL1 session before A2 enrols that account in MFA.
    aal1Token = await factory.issueAccessToken(aal1Admin);
    aal2Admin = await factory.create('A2');
    customerToken = await factory.issueAccessToken(customer);
    vendorAToken = await factory.issueAccessToken(vendorA);
    expect(aal2Admin.accessToken).toBeDefined();

    // Force the acceptance condition in-process rather than relying on a
    // developer shell's setting. ConfigService and AalGuard are constructed
    // below, after this assignment; afterAll restores the caller's setting.
    previousAalRequirement = process.env.ADMIN_REQUIRE_AAL2;
    process.env.ADMIN_REQUIRE_AAL2 = 'true';
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Rate limiting is unrelated to authorization and would make the
      // exhaustive endpoint sweep flaky; auth, role and AAL guards stay real.
      .overrideProvider(RoleThrottlerGuard)
      .useValue({ canActivate: () => true })
      // ConfigModule may already have read .env before this spec assigns the
      // requirement above. Give the real AalGuard an explicit current config.
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ ...process.env, ADMIN_REQUIRE_AAL2: 'true' }))
      // No covered request calls Stripe, but AppModule constructs its client
      // eagerly. Avoid requiring an unrelated payment credential while keeping
      // the authentic Supabase/session authorization path intact.
      .overrideProvider(STRIPE_CLIENT)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  }, 120_000);

  afterAll(async () => {
    try {
      await Promise.all(
        [
          customer,
          vendorA,
          vendorWithOrder,
          vendorWithDocument,
          customerWithDispute,
          aal1Admin,
          aal2Admin,
        ]
          .filter(Boolean)
          .map((identity) => factory.teardown(identity)),
      );
    } finally {
      if (previousAalRequirement === undefined) delete process.env.ADMIN_REQUIRE_AAL2;
      else process.env.ADMIN_REQUIRE_AAL2 = previousAalRequirement;
      await app?.close();
      await factory?.dispose();
    }
  }, 120_000);

  it.each(adminRoutes())(
    'rejects a vendor JWT at admin $method $path',
    async ({ method, path }) => {
      const response = await call(app, method, concretePath(path), vendorAToken);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    },
  );

  it.each(adminRoutes())(
    'rejects a customer JWT at admin $method $path',
    async ({ method, path }) => {
      const response = await call(app, method, concretePath(path), customerToken);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    },
  );

  it('rejects an AAL1 staff JWT and allows a real AAL2 staff JWT', async () => {
    const aal1 = await call(app, RequestMethod.GET, '/v1/admin/dashboard', aal1Token);
    expect(aal1.status).toBe(403);
    expect(aal1.body.code).toBe('AAL2_REQUIRED');

    const aal2 = await call(app, RequestMethod.GET, '/v1/admin/dashboard', aal2Admin.accessToken!);
    expect(aal2.status).toBe(200);

    const queueAccess = await call(
      app,
      RequestMethod.POST,
      '/v1/admin/queues/access',
      aal2Admin.accessToken!,
    );
    expect(queueAccess.status).toBe(201);
    expect(queueAccess.headers['set-cookie']?.[0]).toContain('feastpot_queue_board=');
    expect(queueAccess.body).toEqual({ expiresInSeconds: 300 });
  }, 30_000);

  it('prevents vendor A reading vendor B resources and self-scopes tax profiles', async () => {
    expect(vendorWithOrder.orderId).toBeDefined();
    expect(vendorWithOrder.payoutId).toBeDefined();
    expect(vendorWithDocument.vendorId).toBeDefined();
    expect(customerWithDispute.disputeId).toBeDefined();

    const checks: Array<[string, () => Promise<Response>]> = [
      [
        'order',
        () => call(app, RequestMethod.GET, `/v1/orders/${vendorWithOrder.orderId!}`, vendorAToken),
      ],
      [
        'payout',
        () =>
          call(app, RequestMethod.GET, `/v1/payouts/${vendorWithOrder.payoutId!}`, vendorAToken),
      ],
      [
        'menu',
        () =>
          call(
            app,
            RequestMethod.POST,
            `/v1/vendors/${vendorWithOrder.vendorId!}/menus`,
            vendorAToken,
          ).send({ name: 'Unauthorized menu' }),
      ],
      [
        'documents',
        () =>
          call(
            app,
            RequestMethod.GET,
            `/v1/vendors/${vendorWithDocument.vendorId!}/documents`,
            vendorAToken,
          ),
      ],
      [
        'dispute',
        () =>
          call(
            app,
            RequestMethod.GET,
            `/v1/disputes/${customerWithDispute.disputeId!}`,
            vendorAToken,
          ),
      ],
    ];
    for (const [resource, requestResource] of checks) {
      const response = await requestResource();
      expect({ resource, status: response.status }).toEqual({ resource, status: 403 });
    }

    const vendorBToken = await factory.issueAccessToken(vendorWithOrder);
    const created = await call(
      app,
      RequestMethod.PUT,
      '/v1/vendors/me/tax-profile',
      vendorBToken,
    ).send({
      entityType: 'SOLE_TRADER',
      legalName: 'Vendor B Tax Profile',
      addressLine1: '1 Factory Street',
      city: 'London',
      postcode: 'SE1 1AA',
      dateOfBirth: '1990-01-01',
    });
    expect(created.status).toBe(200);

    const vendorAProfile = await call(
      app,
      RequestMethod.GET,
      '/v1/vendors/me/tax-profile',
      vendorAToken,
    );
    expect(vendorAProfile.status).toBe(200);
    expect(vendorAProfile.body?.vendorId).not.toBe(vendorWithOrder.vendorId);
    expect(vendorAProfile.body?.legalName).not.toBe('Vendor B Tax Profile');
  }, 30_000);
});
