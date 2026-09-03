import { expect, test as setup } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '.auth/admin.json');

/**
 * Signs in with the pre-seeded test admin account and stores cookies so the
 * remaining test projects don't have to log in on every run.
 *
 * Requires:
 *   TEST_ADMIN_EMAIL     - Supabase email for a staff account (any role).
 *   TEST_ADMIN_PASSWORD  - Corresponding password.
 *
 * If either variable is absent the setup test is skipped and downstream tests
 * that depend on the storageState file will fail with a descriptive error.
 */
setup('authenticate as admin', async ({ page }) => {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      '[auth.setup] TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set - skipping auth setup.\n' +
        'Set these env vars to run the admin e2e suite.',
    );
    // Write an empty state so the dependent projects receive a valid (but
    // sessionless) file rather than crashing with a missing-file error.
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3003';
  await page.goto(`${base}/sign-in`);

  // The production form starts both real fields as readonly to prevent
  // browsers from silently autofilling credentials on shared workstations.
  // Target the stable IDs and unlock them before Playwright fills them.
  const emailInput = page.locator('#email');
  const passwordInput = page.locator('#password');

  await emailInput.waitFor({ state: 'visible' });
  await emailInput.evaluate((element) => element.removeAttribute('readonly'));
  await emailInput.fill(email);

  await passwordInput.waitFor({ state: 'visible' });
  await passwordInput.evaluate((element) => element.removeAttribute('readonly'));
  await passwordInput.fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait until we land on an authenticated page (not /sign-in).
  await expect(page).not.toHaveURL(/sign-in/, { timeout: 15_000 });

  await page.context().storageState({ path: AUTH_FILE });
  console.log(`[auth.setup] Signed in as ${email}`);
});
