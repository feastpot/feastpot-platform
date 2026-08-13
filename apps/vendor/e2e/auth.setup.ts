/**
 * Playwright auth setup project.
 *
 * Signs in with the test vendor account and persists the Supabase session
 * (cookies + localStorage) to e2e/.auth/vendor.json so subsequent test
 * projects can load it via storageState without repeating sign-in.
 *
 * Prerequisites:
 *   TEST_VENDOR_EMAIL and TEST_VENDOR_PASSWORD must be set.
 *   The account must belong to a vendor in `live` or `probation` status
 *   so the middleware lets it through to /menu.
 *
 * If the env vars are absent the file is written as empty JSON and a
 * warning is printed. Tests that require auth will see redirect-to-
 *  /sign-in and fail immediately rather than silently producing false
 * passes.
 */
import * as fs from 'fs';
import * as path from 'path';

import { test as setup } from '@playwright/test';

const STATE_PATH = path.join(__dirname, '.auth', 'vendor.json');

setup('authenticate as test vendor', async ({ page }) => {
  const email = process.env.TEST_VENDOR_EMAIL;
  const password = process.env.TEST_VENDOR_PASSWORD;

  if (!email || !password) {
    // Write a sentinel so storageState doesn't crash downstream projects.
    // Tests will still fail because the portal redirects unauthenticated
    // visitors to /sign-in -- that is the desired, visible failure mode.
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    console.warn(
      '\n[auth setup] TEST_VENDOR_EMAIL / TEST_VENDOR_PASSWORD not set.\n' +
        'Tests that reach a gated route will fail with a sign-in redirect.\n',
    );
    return;
  }

  await page.goto('/sign-in');

  // The sign-in form uses a readonly anti-autofill trick: inputs start with
  // readonly="true" to prevent Chrome from pre-filling them, then JS removes
  // the attribute. Playwright's fill() waits for editability and times out
  // if the attribute is never removed. Strip it manually before filling.
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  await emailInput.waitFor({ state: 'visible' });
  await emailInput.evaluate((el) => el.removeAttribute('readonly'));
  await emailInput.fill(email);

  await passwordInput.waitFor({ state: 'visible' });
  await passwordInput.evaluate((el) => el.removeAttribute('readonly'));
  await passwordInput.fill(password);

  await page.locator('button[type="submit"]').click();

  // Wait for the portal to settle on an authenticated route.
  // Newly-approved vendors land on /onboarding; live vendors land on /.
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
    timeout: 15_000,
  });

  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STATE_PATH });
});
