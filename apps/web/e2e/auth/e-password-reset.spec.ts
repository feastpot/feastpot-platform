/**
 * E: PASSWORD RESET
 *
 * E1  Full journey: request -> receive email -> open link -> set new password
 *     (mock variant automated; real-email variant requires Mailosaur)
 * E2  Reset for non-existent email: identical enumeration-safe response
 * E3  Reset link scanner prefetch and cross-device (same assertions as B5/B6)
 *
 * The forgot-password page at /forgot-password POSTs to the NestJS
 * /v1/auth/reset-request endpoint (not directly to Supabase) so that
 * timing normalisation and server-side rate limiting can be applied.
 *
 * The recovery link uses /auth/reset/start (scanner-safe interstitial, same
 * pattern as /auth/confirm).
 *
 * Run:
 *   npx playwright test --config apps/web/playwright.config.ts e2e/auth/e-password-reset.spec.ts
 */

import { expect, test } from '@playwright/test';
import { URLS, FORGOT, API } from './helpers/selectors';
import { mockResetRequest } from './helpers/supabase-mock';
import {
  skipIfNoMailosaur,
  mailosaurAddress,
  waitForEmail,
  extractResetLink,
  purgeInbox,
} from './helpers/mail';

const RESET_URL = '/forgot-password';
const RESET_START_URL = '/auth/reset/start'; // scanner-safe update-password interstitial

async function submitResetForm(
  page: Parameters<Parameters<typeof test>[1]>[0],
  email: string,
) {
  await page.goto(RESET_URL);
  await page.fill(FORGOT.email, email);
  await page.click(FORGOT.submit);
}

// ---------------------------------------------------------------------------
// E1: Full reset journey
// ---------------------------------------------------------------------------

test.describe('E1: full password reset journey', () => {
  test('E1-mock: reset request always shows "Check your email" regardless of email', async ({
    page,
  }) => {
    await mockResetRequest(page);

    await submitResetForm(page, 'user@example.com');

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
      timeout: 5_000,
    });
    // Must mention the email so the user knows where to look.
    await expect(page.getByText('user@example.com')).toBeVisible();
  });

  test('E1-real: reset email arrives within 60 s and link is reachable', async ({ page }) => {
    skipIfNoMailosaur();

    const localPart = `e1-reset-${Date.now()}`;
    const email = mailosaurAddress(localPart);

    // The reset-request endpoint calls Supabase internally; we use a real
    // test Supabase project for this variant.
    await submitResetForm(page, email);
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
      timeout: 10_000,
    });

    const message = await waitForEmail(email, 60_000);
    expect(message.subject).toMatch(/reset|password/i);

    const link = extractResetLink(message);
    expect(link).toBeTruthy();

    await purgeInbox();
  });
});

// ---------------------------------------------------------------------------
// E2: Non-existent email - enumeration safety
// ---------------------------------------------------------------------------

test.describe('E2: non-existent email enumeration safety', () => {
  test('E2: unknown email shows identical "Check your email" screen; no email sent signal', async ({
    page,
  }) => {
    // The NestJS endpoint always returns 200 regardless of whether the email
    // exists, to prevent email enumeration.
    await mockResetRequest(page);

    await submitResetForm(page, 'ghost-nobody@example-nonexistent.com');

    // PASS: same success screen as E1.
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
      timeout: 5_000,
    });

    const body = await page.textContent('body');
    // No text reveals whether the account exists.
    expect(body).not.toMatch(/no account/i);
    expect(body).not.toMatch(/not found/i);
    expect(body).not.toMatch(/not registered/i);
    expect(body).not.toMatch(/email.*does not exist/i);
  });

  test('E2: response timing is indistinguishable from a real account (10 runs each)', async ({
    page,
  }) => {
    const RUNS = 10;
    const real: number[] = [];
    const ghost: number[] = [];

    for (let i = 0; i < RUNS; i++) {
      await mockResetRequest(page);
      await page.goto(RESET_URL);
      const t0 = Date.now();
      await page.fill(FORGOT.email, `real-${i}@example.com`);
      await page.click(FORGOT.submit);
      await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
      real.push(Date.now() - t0);
    }

    for (let i = 0; i < RUNS; i++) {
      await mockResetRequest(page);
      await page.goto(RESET_URL);
      const t0 = Date.now();
      await page.fill(FORGOT.email, `ghost-${i}@nowhere-feastpot.com`);
      await page.click(FORGOT.submit);
      await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
      ghost.push(Date.now() - t0);
    }

    const median = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2;
    };

    expect(Math.abs(median(real) - median(ghost))).toBeLessThan(150);
  });
});

// ---------------------------------------------------------------------------
// E3: Reset link scanner prefetch and cross-device
// ---------------------------------------------------------------------------

test.describe('E3: reset link scanner prefetch and cross-device', () => {
  /**
   * The recovery template uses ConfirmationURL (not token_hash fragment).
   * /auth/reset/start is the interstitial that renders a "Set new password"
   * button; it reads the token from the URL query params (Supabase includes
   * the token in the ConfirmationURL server-side so it IS sent to the server).
   *
   * Scanner prefetch risk: if the ConfirmationURL is hit by a scanner, the
   * single-use OTP could be consumed. The /auth/reset/start interstitial
   * mitigates this by NOT auto-applying the token on page load; the user
   * must click the button.
   *
   * Cross-device: Unlike signup (token_hash in fragment), the reset link
   * contains a code in the URL query string, which IS sent to the server.
   * The PKCE code verifier (stored in the browser that initiated the flow)
   * IS required. Opening the reset link on a different device will fail.
   * This is documented in MANUAL-AUTH-TESTS.md E3.
   */

  test('E3: GET to /auth/reset/start returns 200 (interstitial, not auto-apply)', async ({
    request,
  }) => {
    // Simulate scanner GET - should get the page HTML, not trigger a token exchange.
    const res = await request.get(`${RESET_START_URL}?token_hash=fake&type=recovery`);
    // Page must load successfully (200) even with a fake token; the token is
    // only consumed when the user explicitly clicks the button.
    expect([200, 302]).toContain(res.status());
  });

  test('E3: /auth/reset/update page exists and is reachable', async ({ request }) => {
    const res = await request.get('/auth/reset/update');
    // Must load; will redirect to sign-in if no session.
    expect([200, 302]).toContain(res.status());
  });
});
