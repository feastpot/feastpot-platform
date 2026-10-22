import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import yaml from 'yaml';

import { isAdminCiReady } from './validate-admin-ci-health.mjs';

const workflow = yaml.parse(
  readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
);
const job = workflow.jobs['e2e-admin-shards'];

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
  const steps = job.steps;
  const index = (text) => steps.findIndex(({ run = '' }) => run.includes(text));
  const guard = index('node scripts/ci-database.cjs customer');
  const start = index('npm run dev --workspace=@feastpot/api');
  const ready = index('node scripts/validate-admin-ci-health.mjs');
  const browser = steps.findIndex(({ uses = '' }) => uses.includes('setup-browser'));
  assert.ok(guard > 0 && guard < start && start < ready && ready < browser);
  assert.match(
    steps[start].run,
    /NODE_ENV=test RESEND_API_KEY='' TWILIO_ACCOUNT_SID='' TWILIO_AUTH_TOKEN=''/,
  );
  assert.equal(steps[ready]['timeout-minutes'], 3);
  assert.match(steps[ready].run, /\/v1\/healthz/);
  assert.match(steps[ready].run, /exit 1/);
  assert.equal(steps[ready].env, undefined);
  for (const { run } of steps) {
    if (!run) continue;
    const parsed = spawnSync('bash', ['-n'], { input: run, encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr);
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

test('readiness permits disabled optional services but requires test-mode database and Redis', () => {
  const ready = { status: 'ok', environment: 'test', checks: { database: 'ok', redis: 'ok' } };
  assert.equal(isAdminCiReady(ready), true);
  assert.equal(isAdminCiReady({ ...ready, status: 'degraded' }), true);
  for (const environment of ['production', 'development', undefined]) {
    assert.equal(isAdminCiReady({ ...ready, environment }), false);
  }
  for (const status of ['down', undefined]) {
    assert.equal(isAdminCiReady({ ...ready, status }), false);
  }
  for (const component of ['database', 'redis']) {
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
