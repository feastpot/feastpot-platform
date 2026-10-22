import { expect, type Page } from '@playwright/test';

/** Real hydrated login form; never installs fabricated storage or tokens. */
export async function vendorSignIn(page: Page, email: string, password: string): Promise<void> {
  let phase = 'load';
  try {
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    phase = 'email-focus';
    await emailInput.click();
    await expect(emailInput).toBeEditable();
    await emailInput.fill(email);
    phase = 'password-focus';
    await passwordInput.click();
    await expect(passwordInput).toBeEditable();
    await passwordInput.fill(password);
    phase = 'redirect';
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      }),
      page.locator('button[type="submit"]').click(),
    ]);
  } catch {
    // Do not print request/response bodies, cookies, credentials or JWTs.
    throw new Error(
      `VENDOR_PREFLIGHT_SIGN_IN_FAILED: phase=${phase}; pathname=${new URL(page.url()).pathname}`,
    );
  }
}
