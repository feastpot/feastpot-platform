import { expect, test as setup } from '@playwright/test';
import { browserAuthState } from '../../../scripts/browser-auth-state';
import { TestDataFactory, totp, type TestIdentity } from '../../../scripts/test-factory';

const AUTH_FILES = {
  admin: browserAuthState('admin', 'admin'),
  support: browserAuthState('admin', 'support'),
  finance: browserAuthState('admin', 'finance'),
  compliance: browserAuthState('admin', 'compliance'),
  customer: browserAuthState('admin', 'customer'),
  vendor: browserAuthState('admin', 'vendor'),
} as const;

/**
 * Provisions the namespace-guarded staff identities plus customer/vendor denial
 * identities and signs each one in through the real form. Do not replace this with cookie injection:
 * middleware and server gates must validate the same Supabase sessions a staff
 * member receives in production.
 */
setup('provision and authenticate every staff role', async ({ browser }) => {
  setup.setTimeout(360_000);
  if (
    process.env.ADMIN_REQUIRE_AAL2 !== 'true' ||
    process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2 !== 'true' ||
    process.env.ADMIN_E2E_ALLOW_AAL1 === 'true'
  ) {
    throw new Error(
      'Admin browser setup requires ADMIN_REQUIRE_AAL2=true and NEXT_PUBLIC_ADMIN_REQUIRE_AAL2=true, with ADMIN_E2E_ALLOW_AAL1 disabled. MFA must not be bypassed.',
    );
  }
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
      await emailInput.click();
      await expect(emailInput).toBeEditable();
      await emailInput.fill(identity.credentials.email);
      await passwordInput.waitFor({ state: 'visible' });
      await passwordInput.click();
      await expect(passwordInput).toBeEditable();
      await passwordInput.fill(identity.credentials.password!);
      await page.getByRole('button', { name: /sign in/i }).click();

      if (role === 'customer' || role === 'vendor') {
        // A successful real login is expected to be rejected by the staff
        // server gate. Waiting for that denial ensures the saved storage state
        // contains the issued customer/vendor Supabase session.
        await expect(page).toHaveURL(/\/unauthorized(?:\?|$)/, { timeout: 15_000 });
      } else {
        await expect(page).toHaveURL(/\/settings\/2fa/, { timeout: 30_000 });
        // Preserve the complementary password-only AAL1 guard assertion.
        await expect(page.getByText('2FA setup required before you continue')).toBeVisible();
        await expect(page.locator('aside[aria-label="Admin console navigation"]')).toHaveCount(0);
        await page.getByRole('button', { name: 'Enable 2FA', exact: true }).click();
        const secretElement = page.locator('code').filter({ hasText: /^[A-Z2-7]{16,}$/ });
        await secretElement.waitFor({ state: 'visible', timeout: 30_000 });
        const secret = await secretElement.textContent();
        if (!secret) throw new Error('Admin setup: TOTP enrollment did not return a secret.');
        const verifiedResponse = page.waitForResponse(
          (response) =>
            /\/auth\/v1\/factors\/[^/]+\/verify/.test(response.url()) &&
            response.request().method() === 'POST',
          { timeout: 30_000 },
        );
        await page.locator('#totp-code').fill(totp(secret.trim()));
        await page.getByRole('button', { name: 'Verify and enable', exact: true }).click();
        const verified = await verifiedResponse;
        if (!verified.ok()) throw new Error('Admin setup: genuine TOTP verification failed.');
        const session = (await verified.json()) as { access_token?: string };
        const payload = session.access_token?.split('.')[1];
        if (!payload || JSON.parse(Buffer.from(payload, 'base64url').toString()).aal !== 'aal2') {
          throw new Error('Admin setup: Supabase did not issue an AAL2 session.');
        }
        await expect(page).not.toHaveURL(/settings\/2fa/, { timeout: 30_000 });
        await expect(page).not.toHaveURL(/sign-in|unauthorized/, { timeout: 15_000 });
      }
      await context.storageState({ path: AUTH_FILES[role] });
      await context.close();
    }
  } finally {
    await factory.dispose();
  }
});
