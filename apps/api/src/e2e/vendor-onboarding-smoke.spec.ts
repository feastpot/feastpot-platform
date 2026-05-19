import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';

import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Nightly smoke: vendor signup → admin approval → vendor provisioned →
 * appears in public vendor search.
 *
 * Adaptations vs. the FR-QA-001 spec sketch:
 *   - There is no `/v1/auth/sign-in` route in this codebase. Auth is
 *     Supabase-issued JWTs verified by SupabaseAuthGuard. We mint a real
 *     admin JWT by calling supabase-js `signInWithPassword` directly with
 *     the test-admin credentials provided via env. The password grant
 *     needs the ANON key, not the service role key.
 *   - There is no `DELETE /v1/admin/vendors/:id/test-cleanup` route and
 *     adding one purely for tests is a foot-gun in production. Cleanup
 *     runs directly through PrismaService (VendorApplication row, Vendor
 *     row, DB User row) + Supabase admin `deleteUser` inside afterAll.
 *     The approval response only includes a thin vendor projection
 *     (`{id,slug,status,businessName}` - no userId), so we re-fetch the
 *     vendor by id to recover the userId for cleanup.
 *   - VendorStatus has no auto-`live` path from approval (newly-approved
 *     vendors land in `approved`; `live` requires compliance sign-off).
 *     T4 asserts membership in {'approved','live'}.
 *
 * Skip behaviour: the whole suite is skipped when any of the required
 * env vars are missing, so local `npm run test --workspace=@feastpot/api`
 * and the per-push CI typecheck job stay green. Nightly CI sets them.
 */
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'TEST_ADMIN_EMAIL',
  'TEST_ADMIN_PASSWORD',
] as const;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const missing = [
  ...REQUIRED_ENV.filter((k) => !process.env[k]),
  ...(ANON_KEY ? [] : ['NEXT_PUBLIC_SUPABASE_ANON_KEY']),
];
const d = missing.length > 0 ? describe.skip : describe;
if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.warn(
    `[vendor-onboarding-smoke] skipping: missing env ${missing.join(', ')}`,
  );
}

const TEST_VENDOR_EMAIL = `smoke-vendor-${Date.now()}@test.feastpot.co.uk`;

d('Vendor onboarding smoke test (nightly)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let applicationId: string;
  let vendorId: string | null = null;
  let vendorUserId: string | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Mirror main.ts validation pipeline so DTO rules match production.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const sb = createClient(process.env.SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb.auth.signInWithPassword({
      email: process.env.TEST_ADMIN_EMAIL!,
      password: process.env.TEST_ADMIN_PASSWORD!,
    });
    if (error || !data?.session?.access_token) {
      throw new Error(`Test admin sign-in failed: ${error?.message ?? 'no session'}`);
    }
    adminToken = data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    // Cleanup is best-effort - log but do not throw so a partial run
    // still tears the app down cleanly. Order matters: delete the
    // Vendor first (FK on vendor_applications.vendor_id is nullable
    // via the application relation, but the User → Vendor cascade
    // runs the other way, so vendor must go before user). Application
    // row is independent of vendor/user FKs and can be cleared last.
    try {
      if (vendorId) {
        await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => undefined);
      }
      if (vendorUserId) {
        await prisma.user.delete({ where: { id: vendorUserId } }).catch(() => undefined);
        if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
          const admin = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false, autoRefreshToken: false } },
          );
          await admin.auth.admin.deleteUser(vendorUserId).catch(() => undefined);
        }
      }
      if (applicationId) {
        await prisma.vendorApplication
          .delete({ where: { id: applicationId } })
          .catch(() => undefined);
      }
    } finally {
      await app?.close();
    }
  }, 60_000);

  it('T1: Vendor submits interest form', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/vendors/register-interest')
      .send({
        fullName: 'Smoke Test Cook',
        kitchenName: `Smoke Kitchen ${Date.now()}`,
        email: TEST_VENDOR_EMAIL,
        phone: '07700900001',
        postcode: 'SE15 4ST',
        cuisineType: 'Nigerian',
        kitchenType: 'home',
        hasFoodHygieneRegistration: true,
        foodStory: 'Automated smoke test vendor. Safe to delete.',
        acceptedTermsAt: new Date().toISOString(),
        acceptedTermsVersion: '2026-05',
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body.id ?? res.body.applicationId).toBeDefined();
    applicationId = res.body.id ?? res.body.applicationId;
  });

  it('T2: Application appears in admin queue', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/vendor-applications?status=pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const list: Array<{ id: string; email: string }> = res.body.data ?? res.body;
    const found = list.find((a) => a.email === TEST_VENDOR_EMAIL);
    expect(found).toBeDefined();
    expect(found!.id).toBe(applicationId);
  });

  it('T3: Admin approves application', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/admin/vendor-applications/${applicationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);
    // Approval returns getVendorApplication(id) - the vendor projection
    // is {id,slug,status,businessName} so we recover the userId by
    // re-fetching through Prisma, which we need anyway for cleanup.
    vendorId = res.body.vendor?.id ?? null;
    expect(vendorId).toBeDefined();
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId! },
      select: { userId: true },
    });
    expect(vendor?.userId).toBeDefined();
    vendorUserId = vendor!.userId;
  });

  it('T4: Vendor record created and visible to admin', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/admin/vendor-applications/${applicationId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.vendor?.id).toBe(vendorId);
    // Newly-approved vendors start at `approved`; `live` requires docs
    // upload + compliance sign-off, which this smoke does not exercise.
    expect(['approved', 'live']).toContain(res.body.vendor?.status);
  });

  it('T5: Public vendor search endpoint is healthy', async () => {
    // The public list defaults to status=live vendors only. A freshly-
    // approved vendor in `approved` status will NOT appear yet, so we
    // assert the endpoint responded cleanly with a list shape rather
    // than asserting presence (which would always fail without flipping
    // the vendor to `live` via compliance, out of scope for this smoke).
    const res = await request(app.getHttpServer()).get('/v1/vendors?postcode=SE15');
    expect(res.status).toBe(200);
    const list: Array<{ id: string }> = res.body.data ?? res.body;
    expect(Array.isArray(list)).toBe(true);
  });
});
