const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');
const { prepareDatabase, writeEnvironment } = require('./ci-database.cjs');

const environment = {
  CUSTOMER_E2E_ALLOWED_SUPABASE_REF: 'approveddev',
  SUPABASE_DB_URL:
    'postgresql://postgres.approveddev:dummy@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=9&pool_timeout=10&pgbouncer=true&schema=public',
  NEXT_PUBLIC_SUPABASE_URL: 'https://approveddev.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy-anon-key',
};

test('bounds both customer API and factory pools without changing the target or credentials', () => {
  const { SUPABASE_DB_URL } = prepareDatabase(environment, 'customer');
  const before = new URL(environment.SUPABASE_DB_URL);
  const after = new URL(SUPABASE_DB_URL);
  for (const property of ['protocol', 'hostname', 'port', 'username', 'password', 'pathname']) {
    assert.equal(after[property], before[property]);
  }
  assert.equal(after.searchParams.get('connection_limit'), '1');
  assert.equal(after.searchParams.get('pool_timeout'), '30');
  assert.equal(after.searchParams.get('sslmode'), 'require');
  assert.equal(environment.SUPABASE_DB_URL, before.href);
});

test('RLS uses the approved test database with libpq-compatible options', () => {
  const result = prepareDatabase(environment, 'rls');
  const url = new URL(result.SUPABASE_DIRECT_URL);
  assert.equal(url.hostname, new URL(environment.SUPABASE_DB_URL).hostname);
  assert.equal(url.searchParams.get('sslmode'), 'require');
  for (const key of ['connection_limit', 'pool_timeout', 'pgbouncer', 'schema']) {
    assert.equal(url.searchParams.has(key), false);
  }
  assert.equal(result.PGCONNECT_TIMEOUT, '10');
});

test('allows the approved direct host as well as the approved pooler user', () => {
  const result = prepareDatabase(
    {
      ...environment,
      SUPABASE_DB_URL: 'postgresql://postgres:dummy@db.approveddev.supabase.co/db',
    },
    'rls',
  );
  assert.equal(new URL(result.SUPABASE_DIRECT_URL).hostname, 'db.approveddev.supabase.co');
});

test('rejects missing credentials or project approval without exposing URL inputs', () => {
  for (const key of ['SUPABASE_DB_URL', 'CUSTOMER_E2E_ALLOWED_SUPABASE_REF']) {
    assert.throws(() => prepareDatabase({ ...environment, [key]: '' }, 'customer'), /REQUIRED/);
  }
  assert.throws(
    () => prepareDatabase({ ...environment, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }, 'rls'),
    /ANON_KEY_REQUIRED/,
  );
  assert.throws(
    () => prepareDatabase({ ...environment, SUPABASE_DB_URL: 'invalid-secret-value' }, 'rls'),
    (error) => error.message === 'CI_DATABASE_INVALID_TEST_URL',
  );
  assert.throws(() => prepareDatabase(environment, 'typo'), /INVALID_MODE/);
});

test('rejects production even if mistakenly approved, mismatched projects and lookalike hosts', () => {
  assert.throws(
    () =>
      prepareDatabase(
        { ...environment, CUSTOMER_E2E_ALLOWED_SUPABASE_REF: 'yeklvhoqanxnogjnhkui' },
        'customer',
      ),
    /DEVELOPMENT_PROJECT_REQUIRED/,
  );
  for (const databaseUrl of [
    'postgresql://postgres.otherdev:dummy@aws-0-eu-west-2.pooler.supabase.com:5432/db',
    'postgresql://postgres:dummy@db.otherdev.supabase.co/db',
    'postgresql://postgres.approveddev:dummy@pooler.supabase.com.attacker.test/db',
  ]) {
    assert.throws(
      () => prepareDatabase({ ...environment, SUPABASE_DB_URL: databaseUrl }, 'rls'),
      /TARGET_MISMATCH/,
    );
  }
  assert.throws(
    () =>
      prepareDatabase(
        { ...environment, NEXT_PUBLIC_SUPABASE_URL: 'https://otherdev.supabase.co' },
        'rls',
      ),
    /TARGET_MISMATCH/,
  );
});

test('masks derived credentials before writing the runner environment', () => {
  const events = [];
  const values = prepareDatabase(environment, 'customer');
  writeEnvironment(
    values,
    'environment-file',
    (file, value) => events.push({ type: 'write', file, value }),
    (value) => events.push({ type: 'mask', value }),
  );
  assert.deepEqual(events, [
    { type: 'mask', value: `::add-mask::${values.SUPABASE_DB_URL}` },
    {
      type: 'write',
      file: 'environment-file',
      value: `SUPABASE_DB_URL=${values.SUPABASE_DB_URL}\n`,
    },
  ]);
  assert.throws(() => writeEnvironment(values, ''), /GITHUB_ENV_REQUIRED/);
  assert.throws(
    () => writeEnvironment({ SUPABASE_DB_URL: 'value\nINJECTED=1' }, 'file'),
    /INVALID_ENV_VALUE/,
  );
});

test('rejects query-string target overrides before invoking libpq or Prisma', () => {
  for (const parameter of ['host', 'hostaddr', 'port', 'user', 'password', 'dbname', 'service']) {
    assert.throws(
      () =>
        prepareDatabase(
          { ...environment, SUPABASE_DB_URL: `${environment.SUPABASE_DB_URL}&${parameter}=other` },
          'rls',
        ),
      /TARGET_OVERRIDE_REJECTED/,
    );
  }
});

test('the actual denial script cannot claim success without credentials', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'test-rls-denial.mjs')], {
    env: {},
    encoding: 'utf8',
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /RLS denial tests cannot be verified/);
});
