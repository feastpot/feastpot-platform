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

  // Reject obvious placeholders so the error surfaces before the browser opens.
  const PLACEHOLDERS = new Set(['...', 'real@address.com', 'you@example.com', 'yourpassword', 'realpassword']);
  if (!email || !password || PLACEHOLDERS.has(email) || PLACEHOLDERS.has(password)) {
    throw new Error(
      'auth setup: TEST_VENDOR_EMAIL and TEST_VENDOR_PASSWORD must be set to real\n' +
        'Supabase credentials for a vendor account with status live or probation.\n\n' +
        'Example (substitute your actual values):\n' +
        '  TEST_VENDOR_EMAIL=kwame@example.com \\\n' +
        '  TEST_VENDOR_PASSWORD=hunter2 \\\n' +
        '  npm run test:e2e --workspace=@feastpot/vendor\n\n' +
        `Got: email="${email ?? '(unset)'}", password="${password ? '(set but is a placeholder)' : '(unset)'}".`,
    );
  }

  await page.goto('/sign-in');

  // The sign-in form has two anti-autofill measures:
  //   1. A hidden honeypot password input (name="fakepasswordremembered") that
  //      causes input[type="password"] to resolve to 2 elements, triggering
  //      Playwright strict-mode violations.
  //   2. readonly="true" on the real inputs until a user interaction fires.
  //
  // Fix: target the real fields by their stable IDs (#email, #password) and
  // strip readonly before filling.
  const emailInput = page.locator('#email');
  const passwordInput = page.locator('#password');

  await emailInput.waitFor({ state: 'visible' });
  await emailInput.evaluate((el) => el.removeAttribute('readonly'));
  await emailInput.fill(email);

  await passwordInput.waitFor({ state: 'visible' });
  await passwordInput.evaluate((el) => el.removeAttribute('readonly'));
  await passwordInput.fill(password);

  await page.locator('button[type="submit"]').click();

  // Wait for the portal to settle on an authenticated route.
  // Newly-approved vendors land on /onboarding; live vendors land on /.
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
      timeout: 15_000,
    });
  } catch {
    // Capture whatever error the sign-in page is showing so the developer
    // knows immediately whether this is wrong credentials, an unverified
    // account, rate-limiting, etc.
    const pageError = await page
      .locator('[role="alert"], [data-sonner-toast], .text-red-600, .text-destructive')
      .first()
      .textContent({ timeout: 1_000 })
      .catch(() => null);

    throw new Error(
      `auth setup: sign-in did not redirect away from /sign-in within 15 s.\n` +
        `Current URL: ${page.url()}\n` +
        (pageError ? `Page shows: "${pageError.trim()}"\n\n` : '\n') +
        `Likely causes:\n` +
        `  - Wrong email or password for the test vendor account\n` +
        `  - The account does not exist in this Supabase project\n` +
        `  - The vendor status is not 'live' or 'probation' (middleware blocks other statuses)\n` +
        `  - Supabase rate-limiting (wait 60 s and retry)\n`,
    );
  }

  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STATE_PATH });
});
