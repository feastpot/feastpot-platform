import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { TestDataFactory, type TestIdentity } from '../../../../scripts/test-factory';
import { cleanupDouble } from '../../test/helpers/cleanup-double';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

describe('test factory cleanup ownership (no network)', () => {
  let db: ReturnType<typeof cleanupDouble>;
  const base = 'cleanup-matrix';
  const client = jest.mocked(createClient);
  const factory = (
    namespace: string,
    databaseUrl = 'postgresql://test:test@localhost/factory_test',
  ) =>
    new TestDataFactory({
      databaseUrl,
      prisma: db.prisma as never,
      namespace,
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseServiceRoleKey: 'dummy-service-key',
      supabaseAnonKey: 'dummy-anon-key',
      password: 'dummy-test-password',
    });
  const ids = (model: keyof typeof db.rows) => db.rows[model].map((row) => row.id);
  const retained = (identity: TestIdentity) => {
    expect(ids('user')).toContain(identity.userId);
    expect(ids('vendor')).toContain(identity.vendorId);
    expect(ids('vendorApplication')).toContain(identity.vendorApplicationId);
    expect(db.authUsers.map((user) => user.id)).toContain(identity.userId);
    expect(db.rows.menu.some((row) => row.vendorId === identity.vendorId)).toBe(true);
    expect(db.rows.menuItem.some((row) => row.vendorId === identity.vendorId)).toBe(true);
    for (const object of identity.storageObjects) expect(db.objects).toContainEqual(object);
  };
  const removed = (identity: TestIdentity) => {
    expect(ids('user')).not.toContain(identity.userId);
    expect(ids('vendor')).not.toContain(identity.vendorId);
    expect(ids('vendorApplication')).not.toContain(identity.vendorApplicationId);
    expect(db.authUsers.map((user) => user.id)).not.toContain(identity.userId);
    expect(db.rows.menu.some((row) => row.vendorId === identity.vendorId)).toBe(false);
    expect(db.rows.menuItem.some((row) => row.vendorId === identity.vendorId)).toBe(false);
  };
  const approvedApplicant = () => {
    const identity = db.seed('public-approved-applicant');
    // The approval flow's email/slug are not canonical factory namespace keys.
    identity.credentials.email = 'public-approved-applicant@example.test';
    db.rows.user.find((row) => row.id === identity.userId)!.email = identity.credentials.email;
    db.rows.vendorApplication.find((row) => row.id === identity.vendorApplicationId)!.email =
      identity.credentials.email;
    db.rows.vendorApplication.find((row) => row.id === identity.vendorApplicationId)!.isTestData =
      false;
    db.authUsers.find((row) => row.id === identity.userId)!.email = identity.credentials.email;
    return identity;
  };

  beforeEach(() => {
    db = cleanupDouble();
    client.mockReset().mockReturnValue(db.admin as never);
  });

  it('negative control: the former shared namespace fails matrix preservation', async () => {
    const matrix = db.seed(base);
    const applicant = approvedApplicant();
    await factory(base).teardown(applicant);

    removed(applicant);
    // This is the assertion that failed before the lifecycle namespace fix.
    expect(() => retained(matrix)).toThrow();
    removed(matrix);
    expect(db.admin.auth.admin.deleteUser).toHaveBeenCalledWith(matrix.userId);
  });

  it.each(['lifecycle', 'authorization-target'])(
    '%s cleanup unions explicit and discovered owned IDs, retaining other namespaces and states',
    async (suffix) => {
      const matrix = db.seed(base);
      const namespace = `${base}-${suffix}`;
      const owned = db.seed(namespace);
      const otherState = db.seed(namespace, 'V4');
      const foreign = db.seed(`${namespace}-other`);
      const applicant = approvedApplicant();
      const related = db.seed('explicit-related');
      applicant.storageObjects.push(...related.storageObjects);
      applicant.relatedUserIds = [related.userId, applicant.userId];
      applicant.relatedVendorIds = [related.vendorId!, applicant.vendorId!];
      // Related fixture applications are not owned by a user relation.
      db.rows.vendorApplication = db.rows.vendorApplication.filter(
        (row) => row.id !== related.vendorApplicationId,
      );
      db.rows.order.push(
        { id: 'owned-order', customerId: applicant.userId, vendorId: applicant.vendorId },
        { id: 'matrix-order', customerId: matrix.userId, vendorId: matrix.vendorId },
      );
      db.rows.payment.push(
        { id: 'owned-payment', orderId: 'owned-order', userId: applicant.userId },
        { id: 'matrix-payment', orderId: 'matrix-order', userId: matrix.userId },
      );
      db.rows.payout.push(
        { id: 'owned-payout', vendorId: applicant.vendorId },
        { id: 'matrix-payout', vendorId: matrix.vendorId },
      );
      const sharedTerms = 'shared-fallback-terms';
      db.rows.termsVersion.push({
        id: sharedTerms,
        documentType: 'VENDOR_TERMS',
        version: `tf-${createHash('sha256').update(namespace).digest('hex').slice(0, 20)}-v1`,
      });
      db.rows.termsAcceptance.push(
        { id: 'owned-acceptance', vendorId: applicant.vendorId, termsVersionId: sharedTerms },
        { id: 'matrix-acceptance', vendorId: matrix.vendorId, termsVersionId: sharedTerms },
      );
      const factoryInstance = factory(namespace);
      await factoryInstance.teardown(applicant);
      await factoryInstance.teardown(applicant); // Auth and database deletion are idempotent.

      removed(applicant);
      removed(owned);
      expect(ids('user')).not.toContain(related.userId);
      expect(ids('vendor')).not.toContain(related.vendorId);
      expect(db.authUsers.map((user) => user.id)).not.toContain(related.userId);
      [matrix, foreign, otherState].forEach(retained);
      expect(ids('order')).toEqual(['matrix-order']);
      expect(ids('payment')).toEqual(['matrix-payment']);
      expect(ids('payout')).toEqual(['matrix-payout']);
      expect(ids('termsAcceptance')).toEqual(['matrix-acceptance']);
      expect(ids('termsVersion')).toEqual([sharedTerms]);
      expect(db.objects.some((object) => object.path.includes(`/${namespace}/v5/`))).toBe(false);
      expect(db.objects.some((object) => object.path.includes(`/${base}/v5/`))).toBe(true);
    },
  );

  it('teardownState owns the exact canonical state even without a returned identity', async () => {
    const owned = db.seed(base);
    const other = db.seed(base, 'V4');
    const foreign = db.seed(`${base}-other`);
    await factory(base).teardownState('V5');
    removed(owned);
    [other, foreign].forEach(retained);
  });

  it('discovers marked applications, slug-only vendors and orphan Auth after interrupted setup', async () => {
    const owned = db.seed(base);
    const foreign = db.seed(`${base}-other`);
    db.rows.user = db.rows.user.filter((row) => row.id !== owned.userId);
    db.rows.vendor[0].userId = 'missing-platform-user';
    db.rows.vendorApplication.push({
      id: 'unmarked-same-email',
      email: owned.credentials.email,
      isTestData: false,
    });
    await factory(base).teardownState('V5');
    removed(owned);
    retained(foreign);
    expect(ids('vendorApplication')).toContain('unmarked-same-email');
    expect(db.admin.auth.admin.deleteUser).toHaveBeenCalledWith(owned.userId);
  });

  it.each(['auth-only', 'platform-user'])(
    'create failure after %s provisioning recovers only its partial fixture and preserves the error',
    async (phase) => {
      const foreign = db.seed(base);
      const namespace = `${base}-interrupted`;
      const failure = new Error('controlled interrupted setup');
      if (phase === 'auth-only') db.prisma.user.upsert.mockRejectedValueOnce(failure);
      else db.prisma.address.create.mockRejectedValueOnce(failure);

      await expect(factory(namespace).create('C2')).rejects.toBe(failure);
      retained(foreign);
      expect(db.rows.user).toHaveLength(1);
      expect(db.authUsers).toHaveLength(1);
      expect(db.admin.auth.admin.deleteUser).toHaveBeenCalledWith(
        `auth-tf-${namespace}-c2@test.feastpot.co.uk`,
      );
    },
  );

  it.each([
    { status: 404, message: 'absent' },
    { code: 'user_not_found', message: 'absent' },
    { message: 'User not found' },
  ])('tolerates provider-confirmed deleted Auth users: %j', async (error) => {
    const owned = db.seed(base);
    const foreign = db.seed(`${base}-other`);
    db.authUsers.splice(0, 1);
    db.authErrors.set(owned.userId, error);
    await expect(factory(base).teardown(owned)).resolves.toBeUndefined();
    removed(owned);
    retained(foreign);
  });

  it('surfaces unexpected Auth deletion errors instead of declaring cleanup successful', async () => {
    const owned = db.seed(base);
    db.authErrors.set(owned.userId, { status: 403, message: 'permission denied' });
    await expect(factory(base).teardown(owned)).rejects.toThrow(
      'TEST_FACTORY_AUTH_DELETE_FAILED: permission denied',
    );
    expect(db.authUsers.map((user) => user.id)).toContain(owned.userId);
  });

  it('preserves production-target guards with injected doubles before any cleanup call', () => {
    expect(() => factory(base, 'postgresql://test:test@db.production.example/feastpot')).toThrow(
      'TEST_FACTORY_PRODUCTION_GUARD',
    );
    expect(
      () =>
        new TestDataFactory({
          databaseUrl: 'postgresql://test:test@localhost/factory_test',
          prisma: db.prisma as never,
          supabaseUrl: 'https://production.example.supabase.co',
        }),
    ).toThrow('TEST_FACTORY_PRODUCTION_GUARD');
    expect(client).not.toHaveBeenCalled();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('the real lifecycle and authorization consumers retain their isolated namespace keys', () => {
    const vendor = resolve(__dirname, '../../../..', 'apps/vendor/e2e');
    expect(readFileSync(resolve(vendor, 'vendor-lifecycle-evidence.spec.ts'), 'utf8')).toContain(
      'const namespace = `${baseNamespace}-lifecycle`',
    );
    expect(readFileSync(resolve(vendor, 'vendor-authorization.spec.ts'), 'utf8')).toContain(
      'namespace: `${matrixNamespace()}-authorization-target`',
    );
  });

  it('the cleanup double rejects unscoped or unsupported filters even on empty tables', async () => {
    await expect(db.prisma.order.deleteMany({ where: {} })).rejects.toThrow('Unscoped');
    await expect(
      db.prisma.order.findMany({ where: { vendorId: { startsWith: base } } }),
    ).rejects.toThrow('Unsupported filter');
  });

  it('preflight absence verification detects orphan Auth and storage after database removal', async () => {
    const owned = db.seed(base);
    db.rows.user = [];
    db.rows.vendor = [];
    db.rows.vendorApplication = [];
    await expect(factory(base).assertStateClean('V5')).rejects.toThrow(
      'TEST_FACTORY_CLEANUP_INCOMPLETE',
    );
    db.authUsers.length = 0;
    await expect(factory(base).assertStateClean('V5')).rejects.toThrow(
      'TEST_FACTORY_CLEANUP_INCOMPLETE',
    );
    await factory(base).teardownState('V5');
    await expect(factory(base).assertStateClean('V5')).resolves.toBeUndefined();
    expect(db.admin.auth.admin.deleteUser).not.toHaveBeenCalledWith(owned.userId);
  });
});
