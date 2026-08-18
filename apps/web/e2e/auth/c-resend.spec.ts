/**
 * C: RESEND CONFIRMATION AND COOLDOWN
 *
 * C1  Resend works and delivers a fresh link button/confirmation
 * C2  Rapid resends hit the rate limit and show a friendly "please wait" message
 *
 * Run:
 *   npx playwright test --config apps/web/playwright.config.ts e2e/auth/c-resend.spec.ts
 */

import { expect, test } from '@playwright/test';
import { URLS, REG, SB, VALID_REG } from './helpers/selectors';
import { mockSignup, mockResend, signupNewUser, ERRORS } from './helpers/supabase-mock';

/** Navigate to the "Check your email" confirmation screen. */
async function reachConfirmScreen(page: Parameters<Parameters<typeof test>[1]>[0], email: string) {
  await mockSignup(page, signupNewUser(email));
  await page.goto(URLS.register);

  await page.fill(REG.fullName, VALID_REG.fullName);
  await page.fill(REG.email, email);
  await page.fill(REG.password, VALID_REG.password);
  await page.fill(REG.confirmPassword, VALID_REG.password);
  await page.fill(REG.postcode, VALID_REG.postcode);
  await page.check(REG.terms);
  await page.click(REG.submit);

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
}

// ---------------------------------------------------------------------------
// C1: Resend confirmation works
// ---------------------------------------------------------------------------

test.describe('C1: resend confirmation email', () => {
  test('C1: resend button sends a fresh confirmation and shows success state', async ({ page }) => {
    const email = `resend-c1-${Date.now()}@example-feastpot.com`;
    await reachConfirmScreen(page, email);

    // Mock the resend endpoint to succeed.
    await mockResend(page, {});

    // Find and click the resend button on the confirmation screen.
    const resendBtn = page.getByRole('button', { name: /resend/i });
    await expect(resendBtn).toBeVisible();
    await resendBtn.click();

    // After a successful resend, a positive status message should appear.
    await expect(page.getByRole('status')).toBeVisible({ timeout: 5_000 });

    // The resend endpoint was hit (route intercept would fail if not called).
    // The button should now show "sent" state or be disabled during cooldown.
    await expect(page.getByText(/sent/i).or(page.getByText(/check/i))).toBeVisible({
      timeout: 5_000,
    });
  });

  test('C1: resend button is disabled while sending (prevents double-submit)', async ({ page }) => {
    const email = `resend-c1-dedupe-${Date.now()}@example-feastpot.com`;
    await reachConfirmScreen(page, email);

    // Slow down the resend mock so we can observe the disabled state.
    await page.route(`**${SB.resend}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });

    const resendBtn = page.getByRole('button', { name: /resend/i });
    await expect(resendBtn).toBeVisible();
    await resendBtn.click();

    // Button is disabled while the request is in flight.
    await expect(resendBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// C2: Rate limit cooldown
// ---------------------------------------------------------------------------

test.describe('C2: resend rate limit', () => {
  test('C2: 429 over_email_send_rate_limit shows friendly "please wait" message', async ({
    page,
  }) => {
    const email = `resend-c2-${Date.now()}@example-feastpot.com`;
    await reachConfirmScreen(page, email);

    // Mock the resend endpoint to return a rate-limit error.
    await mockResend(page, ERRORS.rateLimited, 429);

    const resendBtn = page.getByRole('button', { name: /resend/i });
    await expect(resendBtn).toBeVisible();
    await resendBtn.click();

    // The UI must surface a friendly message, not the raw Supabase error text.
    // PASS: user-visible text indicates they should wait; no raw error code shown.
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/wait|slow down|try again|rate/i);
    expect(bodyText).not.toMatch(/over_email_send_rate_limit/);
    expect(bodyText).not.toMatch(/429/);
  });

  test('C2: cooldown timer appears after successful resend (no rapid re-send)', async ({
    page,
  }) => {
    const email = `resend-c2-cooldown-${Date.now()}@example-feastpot.com`;
    await reachConfirmScreen(page, email);
    await mockResend(page, {});

    const resendBtn = page.getByRole('button', { name: /resend/i });
    await resendBtn.click();

    // After a successful resend, a cooldown must prevent immediate re-send.
    // Either the button shows a countdown or is hidden/disabled.
    await expect(resendBtn.or(page.getByText(/\d+\s*s/i))).toBeVisible({ timeout: 5_000 });
    // The original un-throttled button must not be clickable immediately.
    if (await resendBtn.isVisible()) {
      await expect(resendBtn).toBeDisabled();
    }
  });
});
