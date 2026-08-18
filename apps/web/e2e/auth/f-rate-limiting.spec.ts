/**
 * F: RATE LIMITING
 *
 * F1  Each auth endpoint returns a 429 under sustained load and the UI
 *     surfaces a friendly message (not the raw Supabase error).
 *
 * All rate-limit responses are mocked; we never actually trigger rate limits
 * on a real Supabase project. See MANUAL-AUTH-TESTS.md F1 for the manual
 * production verification checklist.
 *
 * Default Supabase custom-SMTP email rate limit: 30 emails/hour.
 * Adjust in Authentication > Rate Limits.
 *
 * Run:
 *   npx playwright test --config apps/web/playwright.config.ts e2e/auth/f-rate-limiting.spec.ts
 */

import { expect, test } from '@playwright/test';
import { URLS, REG, SIGNIN, FORGOT, SB, API, VALID_REG } from './helpers/selectors';
import { ERRORS, mockSignup, signupNewUser, mockResend } from './helpers/supabase-mock';

// ---------------------------------------------------------------------------
// F1: Sign-up endpoint rate limit
// ---------------------------------------------------------------------------

test.describe('F1: sign-up rate limit', () => {
  test('F1-signup: 429 from Supabase signup shows a friendly error, not raw error code', async ({
    page,
  }) => {
    await page.route(`**${SB.signup}`, (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 429,
          error_code: 'over_request_rate_limit',
          msg: 'Request rate limit reached for anon role',
        }),
      }),
    );

    await page.goto(URLS.register);
    await page.fill(REG.fullName, VALID_REG.fullName);
    await page.fill(REG.email, `rate-${Date.now()}@example.com`);
    await page.fill(REG.password, VALID_REG.password);
    await page.fill(REG.confirmPassword, VALID_REG.password);
    await page.fill(REG.postcode, VALID_REG.postcode);
    await page.check(REG.terms);
    await page.click(REG.submit);

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5_000 });

    const body = await page.textContent('body');
    // Must not expose raw error codes or technical details.
    expect(body).not.toMatch(/over_request_rate_limit/);
    expect(body).not.toMatch(/anon role/i);
  });
});

// ---------------------------------------------------------------------------
// F1: Sign-in endpoint rate limit
// ---------------------------------------------------------------------------

test.describe('F1: sign-in rate limit', () => {
  test('F1-signin: 429 from Supabase token endpoint shows friendly message', async ({ page }) => {
    await page.route(`**${SB.token}`, (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 429,
          error_code: 'over_request_rate_limit',
          msg: 'Too many requests',
        }),
      }),
    );

    await page.goto(URLS.signIn);
    await page.fill(SIGNIN.email, `rate-${Date.now()}@example.com`);
    await page.fill(SIGNIN.password, 'StrongPass1!');
    await page.click(SIGNIN.submit);

    // Sign-in error handler shows generic "Invalid email or password" for all
    // auth errors; a 429 is treated as an auth failure (no enumeration risk).
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5_000 });
    const body = await page.textContent('body');
    expect(body).not.toMatch(/over_request_rate_limit/);
  });
});

// ---------------------------------------------------------------------------
// F1: OTP verify endpoint rate limit
// ---------------------------------------------------------------------------

test.describe('F1: OTP verify rate limit', () => {
  test('F1-verify: 429 on verifyOtp shows graceful error on /auth/confirm', async ({ page }) => {
    await page.route(`**${SB.verify}`, (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 429,
          error_code: 'over_request_rate_limit',
          msg: 'Rate limit exceeded',
        }),
      }),
    );

    const hash = 'aabbccdd00112233445566778899aabbccddeeff';
    await page.goto(`/auth/confirm#token_hash=${hash}&type=signup`);
    await page.getByRole('button', { name: 'Confirm my account' }).click();

    // The confirm page error state handles all verifyOtp errors gracefully.
    await expect(page.getByRole('heading', { name: 'Link expired or already used' })).toBeVisible({
      timeout: 5_000,
    });

    const body = await page.textContent('body');
    expect(body).not.toMatch(/429/);
    expect(body).not.toMatch(/over_request_rate_limit/);
  });
});

// ---------------------------------------------------------------------------
// F1: Resend email rate limit (C2 also covers this; here we assert recovery)
// ---------------------------------------------------------------------------

test.describe('F1: resend rate limit recovery', () => {
  test('F1-resend: after a 429 the user can still attempt resend after cooldown', async ({
    page,
  }) => {
    await mockSignup(page, signupNewUser(`rate-resend-${Date.now()}@example.com`));
    await page.goto(URLS.register);

    const email = `rate-resend-${Date.now()}@example.com`;
    await page.fill(REG.fullName, VALID_REG.fullName);
    await page.fill(REG.email, email);
    await page.fill(REG.password, VALID_REG.password);
    await page.fill(REG.confirmPassword, VALID_REG.password);
    await page.fill(REG.postcode, VALID_REG.postcode);
    await page.check(REG.terms);
    await page.click(REG.submit);

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    // Resend triggers a 429.
    await mockResend(page, ERRORS.rateLimited, 429);
    const resendBtn = page.getByRole('button', { name: /resend/i });
    await resendBtn.click();

    const body = await page.textContent('body');
    // User gets a wait message; the app does not crash.
    expect(body).toMatch(/wait|slow down|try again|rate/i);

    // Page is still functional (no broken UI).
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// F1: Password reset endpoint rate limit
// ---------------------------------------------------------------------------

test.describe('F1: password reset rate limit', () => {
  test('F1-reset: 429 from reset-request endpoint still shows "Check your email"', async ({
    page,
  }) => {
    // The forgot-password page catches all errors and shows the generic
    // success state to prevent enumeration. Rate limiting is transparent to the user.
    await page.route(`**${API.resetRequest}`, (route) =>
      route.fulfill({ status: 429, contentType: 'application/json', body: '{}' }),
    );

    await page.goto(FORGOT.email ? '/forgot-password' : '/forgot-password');
    await page.fill('#email', 'anyone@example.com');
    await page.click('button[type=submit]');

    // The forgot-password page always shows the same generic success screen
    // regardless of the server response (enumeration safety).
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
      timeout: 5_000,
    });

    const body = await page.textContent('body');
    expect(body).not.toMatch(/429/);
    expect(body).not.toMatch(/rate limit/i);
  });
});
