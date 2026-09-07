import { expect, test as setup } from '@playwright/test';
import path from 'path';
import { TestDataFactory, type TestIdentity } from '../../../scripts/test-factory';

const AUTH_DIRECTORY = path.join(__dirname, '.auth');
const AUTH_FILES = {
  admin: path.join(AUTH_DIRECTORY, 'admin.json'),
  support: path.join(AUTH_DIRECTORY, 'support.json'),
  finance: path.join(AUTH_DIRECTORY, 'finance.json'),
  compliance: path.join(AUTH_DIRECTORY, 'compliance.json'),
  customer: path.join(AUTH_DIRECTORY, 'customer.json'),
  vendor: path.join(AUTH_DIRECTORY, 'vendor.json'),
} as const;

/**
 * Provisions the namespace-guarded staff identities plus customer/vendor denial
 * identities and signs each one in through the real form. Do not replace this with cookie injection:
 * middleware and server gates must validate the same Supabase sessions a staff
 * member receives in production.
 */
setup('provision and authenticate every staff role', async ({ browser }) => {
  const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3003';
  const factory = TestDataFactory.fromEnvironment();
  const identities: Array<[keyof typeof AUTH_FILES, TestIdentity]> = [];
  try {
    identities.push(['admin', await factory.create('A1')]);
    identities.push(['support', await factory.create('A3')]);
    identities.push(['finance', await factory.create('A4')]);
    identities.push(['compliance', await factory.create('A5')]);
    // These are real non-staff sessions, not hand-written cookies. The matrix
    // uses them to prove a customer or vendor cannot obtain an admin shell.
    identities.push(['customer', await factory.create('C1')]);
    identities.push(['vendor', await factory.create('V4')]);

    for (const [role, identity] of identities) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${base}/sign-in`);

      // The production form starts both real fields as readonly to prevent
      // browsers from silently autofilling credentials on shared workstations.
      const emailInput = page.locator('#email');
      const passwordInput = page.locator('#password');
      await emailInput.waitFor({ state: 'visible' });
      await emailInput.evaluate((element) => element.removeAttribute('readonly'));
      await emailInput.fill(identity.credentials.email);
      await passwordInput.waitFor({ state: 'visible' });
      await passwordInput.evaluate((element) => element.removeAttribute('readonly'));
      await passwordInput.fill(identity.credentials.password!);
      await page.getByRole('button', { name: /sign in/i }).click();

      if (role === 'customer' || role === 'vendor') {
        // A successful real login is expected to be rejected by the staff
        // server gate. Waiting for that denial ensures the saved storage state
        // contains the issued customer/vendor Supabase session.
        await expect(page).toHaveURL(/\/unauthorized(?:\?|$)/, { timeout: 15_000 });
      } else {
        await expect(page).not.toHaveURL(/sign-in|unauthorized/, { timeout: 15_000 });
      }
      await context.storageState({ path: AUTH_FILES[role] });
      await context.close();
    }
  } finally {
    await factory.dispose();
  }
});
