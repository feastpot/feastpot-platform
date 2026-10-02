import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('a menu redirect cannot delete the shared vendor session', () => {
  const menu = source('apps/vendor/e2e/menu-screen.spec.ts');
  assert.doesNotMatch(menu, /rmSync|unlinkSync|deleted stale session cache/);
  assert.match(menu, /shared session is preserved/);
});

test('worker auth paths are run-isolated and outside result cleanup', () => {
  const helper = source('scripts/browser-auth-state.ts');
  assert.match(helper, /process\.env\.FEASTPOT_E2E_AUTH_ROOT \?\?=/);
  assert.match(helper, /tmpdir\(\)/);
  assert.match(helper, /randomUUID\(\)/);
  for (const app of ['vendor', 'admin']) {
    const config = source(`apps/${app}/playwright.config.ts`);
    assert.match(config, /browserAuthState/);
    assert.doesNotMatch(config, /storageState: 'e2e\/\.auth/);
    assert.match(config, /maxFailures: 0/);
  }
});

test('customer failures do not bail out remaining selected tests', () => {
  for (const spec of ['checkout-conditions', 'payment-states']) {
    assert.doesNotMatch(source(`apps/web/e2e/customer/${spec}.spec.ts`), /mode: 'serial'/);
  }
  const config = source('apps/web/playwright.config.ts');
  assert.match(config, /workers: 1/);
  assert.match(config, /maxFailures: 0/);
  assert.match(config, /outputFile: 'e2e-results.json'/);
  assert.match(
    source('apps/web/e2e/customer/checkout-financials.spec.ts'),
    /test\.beforeEach\(\(\) => \{\s*assertCustomerSmokeEnvironment\(\)/,
  );
});

test('admin setup requires real TOTP and verifies the issued assurance level', () => {
  const setup = source('apps/admin/e2e/auth.setup.ts');
  assert.match(setup, /ADMIN_REQUIRE_AAL2 !== 'true'/);
  assert.match(setup, /ADMIN_E2E_ALLOW_AAL1 === 'true'/);
  assert.match(setup, /totp\(secret\.trim\(\)\)/);
  assert.match(setup, /aal !== 'aal2'/);
  assert.match(
    source('apps/admin/src/lib/admin-destinations.ts'),
    /'\/platform-facts': STAFF_ROLES/,
  );
});

test('missing email-provider credentials fail rather than silently skip', () => {
  const helper = source('apps/web/e2e/auth/helpers/mail.ts');
  assert.doesNotMatch(helper, /test\.skip\(/);
  assert.match(helper, /throw new Error/);
});

test('the local runner propagates suite failures and differentiates blocked tests', () => {
  const runner = source('scripts/run-browser-determinism.ts');
  assert.match(
    runner,
    /if \(exit !== 0 \|\| 'reportMissing' in suiteCounts\) process\.exitCode = 1/,
  );
  assert.match(runner, /PLAYWRIGHT_JSON_OUTPUT_FILE/);
  assert.match(runner, /else result\.didNotRun\+\+/);
});
