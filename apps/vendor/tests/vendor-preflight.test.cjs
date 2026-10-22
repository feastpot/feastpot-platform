const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const ts = require('typescript');
const yaml = require('yaml');

function load(name, modules = {}, environment = {}) {
  const source = readFileSync(path.join(__dirname, '../e2e/helpers', name), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    URL,
    Date,
    process: { env: environment },
    require(name) {
      if (!(name in modules)) throw new Error(`Unexpected preflight dependency: ${name}`);
      return modules[name];
    },
  });
  return exports;
}

test('preflight uses real browser-context SSR cookies, not a minted identity', async () => {
  const { requireBrowserSession } = load('vendor-preflight.ts');
  let cookieReads = 0;
  const { browserAccessToken } = load(
    'browser-access-token.ts',
    {
      '@supabase/ssr': {
        createServerClient: (_url, _key, { cookies }) => ({
          auth: {
            getSession: async () => {
              const all = await cookies.getAll();
              return { data: { session: all.length ? { access_token: 'cookie-session' } : null } };
            },
          },
        }),
      },
    },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://fake.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy' },
  );
  const page = {
    url: () => 'http://localhost:3002/menu',
    context: () => ({
      cookies: async (origin) => {
        assert.equal(origin, 'http://localhost:3002');
        cookieReads++;
        return [{ name: 'sb-fake-auth-token.0', value: 'test-cookie' }];
      },
    }),
  };
  assert.equal(await requireBrowserSession(() => browserAccessToken(page)), 'cookie-session');
  assert.equal(cookieReads, 1);
  await assert.rejects(
    requireBrowserSession(() =>
      browserAccessToken({ ...page, context: () => ({ cookies: async () => [] }) }),
    ),
    /VENDOR_PREFLIGHT_COOKIE_SESSION_FAILED/,
  );
  await assert.rejects(
    requireBrowserSession(async () => ''),
    /VENDOR_PREFLIGHT_COOKIE_SESSION_FAILED/,
  );
});

function owners() {
  const calls = [];
  return {
    calls,
    records: ['actor', 'target'].map((role, index) => ({
      namespace: `vendor-preflight-unit-${role}`,
      state: index ? 'V9' : 'V4',
      factory: {
        teardownState: async (state) => calls.push(`delete-${role}-${state}`),
        assertStateClean: async () => calls.push(`verify-${role}`),
        dispose: async () => calls.push(`dispose-${role}`),
      },
    })),
  };
}

test('a deliberately wrong cleanup namespace fails before deleting anything', async () => {
  const { cleanupPreflight } = load('vendor-preflight.ts');
  const { records, calls } = owners();
  records[0].namespace = 'vendor-matrix-shared';
  await assert.rejects(cleanupPreflight('vendor-preflight-unit', records), /NAMESPACE_MISMATCH/);
  assert.deepEqual(calls, []);
});

test('preflight cleanup verifies both scopes and surfaces leftover fixtures', async () => {
  const { cleanupPreflight } = load('vendor-preflight.ts');
  const healthy = owners();
  await cleanupPreflight('vendor-preflight-unit', healthy.records);
  assert.deepEqual(healthy.calls, [
    'delete-actor-V4',
    'verify-actor',
    'dispose-actor',
    'delete-target-V9',
    'verify-target',
    'dispose-target',
  ]);
  const broken = owners();
  broken.records[0].factory.assertStateClean = async () => {
    throw new Error('remaining Auth user');
  };
  await assert.rejects(cleanupPreflight('vendor-preflight-unit', broken.records), /CLEANUP_FAILED/);
  assert.ok(broken.calls.includes('delete-target-V9'));
  assert.ok(broken.calls.includes('dispose-actor'));
});

test('early preflight gates customer checks without replacing the authoritative eight projects', () => {
  const workflow = yaml.parse(
    readFileSync(path.join(__dirname, '../../../.github/workflows/ci.yml'), 'utf8'),
  );
  const jobs = workflow.jobs;
  assert.deepEqual(jobs['vendor-preflight'].needs, ['setup']);
  assert.ok(jobs['e2e-customer-shards'].needs.includes('vendor-preflight'));
  assert.ok(jobs['e2e-customer-shards'].needs.includes('vendor-preflight-cleanup'));
  assert.deepEqual(jobs['vendor-preflight-cleanup'].needs, ['vendor-preflight']);
  assert.equal(jobs['vendor-preflight-cleanup'].if, '${{ always() }}');
  assert.ok(jobs['e2e-vendor'].needs.includes('cross-surface-consistency'));
  assert.ok(jobs['release-readiness'].needs.includes('vendor-preflight'));
  assert.ok(jobs['release-readiness'].needs.includes('vendor-preflight-cleanup'));
  assert.ok(jobs['release-readiness'].needs.includes('e2e-vendor'));
  const run = jobs['e2e-vendor'].steps.find((step) =>
    step.name?.startsWith('Run authoritative vendor lifecycle'),
  ).run;
  assert.equal((run.match(/--project=vendor-/g) || []).length, 8);
  const validate = jobs['e2e-vendor'].steps.find((step) =>
    step.name?.startsWith('Validate every authoritative'),
  ).run;
  assert.match(validate, /--strict/);
  assert.match(validate, /--expected-project-count 8/);
  const config = readFileSync(path.join(__dirname, '../playwright.preflight.config.ts'), 'utf8');
  assert.match(config, /timeout: 180_000/);
  assert.match(config, /globalTimeout: 250_000/);
  assert.match(config, /retries: 0/);
  assert.match(config, /testDir: '.\/preflight'/);
});
