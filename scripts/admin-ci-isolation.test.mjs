import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import yaml from 'yaml';

import releaseGate from './check-release-readiness.cjs';
import { isAdminCiReady, readinessDiagnostics } from './validate-admin-ci-health.mjs';

const workflow = yaml.parse(
  readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
);
const job = workflow.jobs['e2e-admin-shards'];
const bootstrapPath = './.github/actions/start-isolated-api';
const bootstrap = yaml.parse(
  readFileSync(
    new URL('../.github/actions/start-isolated-api/action.yml', import.meta.url),
    'utf8',
  ),
);

test('admin shards test this commit against the approved isolated development target', () => {
  const env = job.env;
  for (const key of ['TEST_API_URL', 'NEXT_PUBLIC_API_URL', 'API_URL']) {
    assert.equal(env[key], 'http://127.0.0.1:3001');
  }
  assert.equal(env.SUPABASE_DB_URL, '${{ secrets.TEST_SUPABASE_DB_URL }}');
  assert.equal(env.SUPABASE_DIRECT_URL, env.SUPABASE_DB_URL);
  assert.equal(env.CUSTOMER_E2E_ALLOWED_API_ORIGIN, env.TEST_API_URL);
  assert.equal(
    env.CUSTOMER_E2E_ALLOWED_SUPABASE_REF,
    '${{ vars.CUSTOMER_E2E_ALLOWED_SUPABASE_REF }}',
  );
  assert.equal(env.CUSTOMER_E2E_ISOLATED_ENVIRONMENT, 'true');
  assert.equal(env.CUSTOMER_E2E_USE_FACTORY, 'true');
  const credentials = job.steps.find(({ name }) => name === 'Require admin E2E credentials');
  assert.match(credentials.run, /sk_test_\*/);
  assert.match(credentials.run, /SUPABASE_DIRECT_URL CUSTOMER_E2E_ALLOWED_SUPABASE_REF/);
});

test('database safety precedes startup and verified readiness precedes every browser', () => {
  const steps = bootstrap.runs.steps;
  const index = (text) => steps.findIndex(({ run = '' }) => run.includes(text));
  const guard = index('node scripts/ci-database.cjs customer');
  const signer = index("require('node:crypto').randomBytes(32)");
  const start = index('npm run dev --workspace=@feastpot/api');
  const ready = index('node scripts/validate-admin-ci-health.mjs');
  const browser = job.steps.findIndex(({ uses = '' }) => uses.includes('setup-browser'));
  const api = job.steps.findIndex(({ uses }) => uses === bootstrapPath);
  assert.ok(guard >= 0 && guard < signer && signer < start && start < ready);
  assert.ok(api >= 0 && api < browser);
  assert.match(steps[signer].run, /TEST_API_URL !== 'http:\/\/127\.0\.0\.1:3001'/);
  assert.match(steps[signer].run, /CUSTOMER_E2E_ISOLATED_ENVIRONMENT !== 'true'/);
  assert.match(steps[signer].run, /STRIPE_WEBHOOK_SECRET=/);
  assert.ok(
    steps[signer].run.indexOf('::add-mask::') < steps[signer].run.indexOf('appendFileSync'),
  );
  assert.match(
    steps[start].run,
    /NODE_ENV=test STRIPE_SECRET_KEY="\$STRIPE_SECRET_KEY_TEST" RESEND_API_KEY="" TWILIO_ACCOUNT_SID="" TWILIO_AUTH_TOKEN=""/,
  );
  assert.match(steps[start].run, /setsid bash/);
  assert.equal(job.steps[api]['timeout-minutes'], 3);
  assert.match(steps[ready].run, /\/v1\/healthz/);
  assert.match(steps[ready].run, /--fail-with-body/);
  assert.match(steps[ready].run, /--diagnose/);
  assert.match(steps[ready].run, /exit 1/);
  assert.equal(steps[ready].env, undefined);
  for (const { run, shell } of steps) {
    if (!run) continue;
    assert.equal(shell, 'bash');
    const parsed = spawnSync('bash', ['-n'], { input: run, encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr);
  }
});

test('fast setup contracts and the shared runtime probe gate expensive acceptance and release', () => {
  const setup = workflow.jobs.setup.steps.find(({ run = '' }) =>
    run.includes('scripts/admin-ci-isolation.test.mjs'),
  );
  assert.ok(setup);
  assert.match(setup.run, /scripts\/ci-database.test.cjs/);
  assert.match(setup.run, /scripts\/check-release-readiness.test.cjs/);
  assert.ok(
    workflow.jobs.setup.steps.some(
      ({ run }) => run === 'npm run test:unit --workspace=@feastpot/admin',
    ),
  );
  const adminPackage = JSON.parse(
    readFileSync(new URL('../apps/admin/package.json', import.meta.url), 'utf8'),
  );
  assert.match(adminPackage.scripts['test:unit'], /src\/lib\/admin-ageing.test.ts/);
  const early = workflow.jobs['api-readiness'];
  assert.deepEqual(early.needs, ['setup']);
  const start = early.steps.find(({ uses }) => uses === bootstrapPath);
  assert.ok(start);
  assert.equal(start['timeout-minutes'], 3);
  for (const [key, value] of Object.entries(early.env)) {
    if (key === 'TEST_FACTORY_NAMESPACE') continue;
    assert.equal(job.env[key], value, `API preflight/admin environment mismatch: ${key}`);
  }
  assert.notEqual(early.env.TEST_FACTORY_NAMESPACE, job.env.TEST_FACTORY_NAMESPACE);
  const stop = early.steps.at(-1);
  assert.equal(stop.if, '${{ always() }}');
  assert.match(stop.run, /kill -- "-\$pid"/);
  assert.ok(workflow.jobs['e2e-customer-shards'].needs.includes('api-readiness'));
  if (workflow.jobs['vendor-preflight']) {
    assert.ok(workflow.jobs['vendor-preflight'].needs.includes('api-readiness'));
    assert.ok(workflow.jobs['e2e-customer-shards'].needs.includes('vendor-preflight'));
  }
  assert.ok(workflow.jobs['release-readiness'].needs.includes('api-readiness'));
  assert.ok(releaseGate.REQUIRED_JOBS.includes('api-readiness'));
  for (const required of releaseGate.REQUIRED_JOBS) {
    assert.ok(workflow.jobs[required], `Required job must exist: ${required}`);
    assert.ok(
      workflow.jobs['release-readiness'].needs.includes(required),
      `Required job must supply its result to release readiness: ${required}`,
    );
  }
});

test('four admin shards, genuine MFA and authoritative downstream ordering stay mandatory', () => {
  assert.deepEqual(job.strategy.matrix.shard, [1, 2, 3, 4]);
  assert.deepEqual(job.needs, ['setup', 'e2e-admin-actions']);
  assert.equal(job.env.ADMIN_REQUIRE_AAL2, 'true');
  assert.equal(job.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2, 'true');
  assert.equal(job.env.ADMIN_E2E_ALLOW_AAL1, 'false');
  assert.ok(workflow.jobs['e2e-admin'].needs.includes('e2e-admin-shards'));
  assert.ok(workflow.jobs['cross-surface-consistency'].needs.includes('e2e-admin'));
  assert.ok(workflow.jobs['e2e-vendor'].needs.includes('cross-surface-consistency'));
});

test('the ephemeral webhook signer executes only for the isolated loopback target', () => {
  const script = bootstrap.runs.steps.find(({ run = '' }) =>
    run.includes("require('node:crypto')"),
  ).run;
  const directory = mkdtempSync(join(tmpdir(), 'admin-ci-signer-'));
  try {
    const environment = {
      PATH: process.env.PATH,
      GITHUB_ENV: join(directory, 'environment'),
      TEST_API_URL: 'http://127.0.0.1:3001',
      CUSTOMER_E2E_ISOLATED_ENVIRONMENT: 'true',
      STRIPE_SECRET_KEY_TEST: 'sk_test_unit_contract_only',
    };
    const execute = (env) => spawnSync('bash', ['-e', '-c', script], { env, encoding: 'utf8' });
    const result = execute(environment);
    assert.equal(result.status, 0);
    const assignment = readFileSync(environment.GITHUB_ENV, 'utf8');
    assert.ok(/^STRIPE_WEBHOOK_SECRET=whsec_[a-f0-9]{64}\n$/.test(assignment));
    assert.ok(result.stdout.startsWith('::add-mask::whsec_'));
    for (const overrides of [
      { TEST_API_URL: 'https://example.invalid' },
      { CUSTOMER_E2E_ISOLATED_ENVIRONMENT: 'false' },
      { STRIPE_SECRET_KEY_TEST: 'sk_live_forbidden_unit_fixture' },
    ]) {
      const rejected = execute({ ...environment, ...overrides });
      assert.notEqual(rejected.status, 0);
      assert.equal(rejected.stdout, '');
      assert.ok(readFileSync(environment.GITHUB_ENV, 'utf8') === assignment);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('readiness permits disabled optional services but requires test-mode database and Redis', () => {
  const ready = {
    status: 'ok',
    environment: 'test',
    checks: { database: 'ok', redis: 'ok', secrets: 'ok' },
  };
  assert.equal(isAdminCiReady(ready), true);
  assert.equal(isAdminCiReady({ ...ready, status: 'degraded' }), true);
  for (const environment of ['production', 'development', undefined]) {
    assert.equal(isAdminCiReady({ ...ready, environment }), false);
  }
  for (const status of ['down', undefined]) {
    assert.equal(isAdminCiReady({ ...ready, status }), false);
  }
  for (const component of ['database', 'redis', 'secrets']) {
    for (const status of ['error', 'disabled', 'timeout', undefined]) {
      assert.equal(
        isAdminCiReady({ ...ready, checks: { ...ready.checks, [component]: status } }),
        false,
      );
    }
  }
  assert.equal(isAdminCiReady({ status: 'ok', db: 'ok' }), false);
  assert.equal(isAdminCiReady(null), false);
});

test('readiness diagnostics contain only fixed booleans, never response content', () => {
  assert.deepEqual(
    readinessDiagnostics({
      environment: 'test',
      checks: { database: 'ok', redis: 'ok', secrets: 'missing: PRIVATE_CONTENT' },
      private: 'PRIVATE_CONTENT',
    }),
    {
      responseParsed: true,
      testEnvironment: true,
      databaseReady: true,
      redisReady: true,
      requiredSecretsReady: false,
    },
  );
  for (const value of Object.values(readinessDiagnostics(null))) assert.equal(value, false);
});
