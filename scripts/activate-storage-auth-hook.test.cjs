const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assessReadiness, connectionEnv } = require('./activate-storage-auth-hook.cjs');

const health = {
  checks: {
    database: 'ok',
    authTokenClaims: 'app_role-v1',
    supabase: { environment: 'production', ref: 'fixture-project' },
  },
};
const inspection = {
  staged: true,
  authAdmin: true,
  privateBucket: true,
  storageRls: true,
  databaseRole: 'vendor',
  appRole: null,
};

test('allows activation only with the compatible production API and staged hook', () => {
  assert.deepEqual(assessReadiness(health, inspection, 'fixture-project'), {
    ready: true,
    blockers: [],
    alreadyActive: false,
  });
});
for (const [name, change, blocker] of [
  ['legacy live API', { authTokenClaims: undefined }, 'COMPATIBLE_API_NOT_LIVE'],
  [
    'development API',
    { supabase: { environment: 'development', ref: 'fixture-project' } },
    'API_IS_NOT_ON_PRODUCTION_SUPABASE',
  ],
  [
    'different project',
    { supabase: { environment: 'production', ref: 'other-project' } },
    'API_AND_DATABASE_PROJECTS_DO_NOT_MATCH',
  ],
  ['database down', { database: 'error' }, 'API_DATABASE_NOT_HEALTHY'],
]) {
  test(`blocks ${name}`, () => {
    const result = assessReadiness(
      { checks: { ...health.checks, ...change } },
      inspection,
      'fixture-project',
    );
    assert.equal(result.ready, false);
    assert(result.blockers.includes(blocker));
  });
}
for (const field of ['staged', 'authAdmin', 'privateBucket', 'storageRls']) {
  test(`blocks missing ${field}`, () => {
    assert.equal(
      assessReadiness(health, { ...inspection, [field]: false }, 'fixture-project').ready,
      false,
    );
  });
}
test('already-correct claims make activation a no-op', () => {
  assert.equal(
    assessReadiness(
      health,
      {
        ...inspection,
        databaseRole: 'authenticated',
        appRole: 'customer',
      },
      'fixture-project',
    ).alreadyActive,
    true,
  );
});

test('automatic migration stages only; it cannot switch the registered live hook', () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      '../prisma/migrations/20261003020000_separate_supabase_database_and_app_roles/migration.sql',
    ),
    'utf8',
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.custom_access_token_hook_v2\(event jsonb\)/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.custom_access_token_hook\(event jsonb\)/,
  );
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.custom_access_token_hook_v2/);
});

test('explicit libpq fields override unrelated inherited database settings', () => {
  const env = connectionEnv(
    'postgresql://postgres.fixture:example%21@sample.pooler.supabase.com:5432/postgres?sslmode=require',
  );
  assert.equal(env.PGHOST, 'sample.pooler.supabase.com');
  assert.equal(env.PGUSER, 'postgres.fixture');
  assert.equal(env.PGPASSWORD, 'example!');
  assert.equal(env.PGDATABASE, 'postgres');
  assert.equal(env.PGPORT, '5432');
  assert.equal(env.PGSERVICE, undefined);
  assert.equal(env.PGHOSTADDR, undefined);
});
