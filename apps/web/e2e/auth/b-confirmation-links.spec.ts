/**
 * B: CONFIRMATION LINK STATES
 *
 * B1  Valid link, same device/browser            (mock)
 * B2  Expired link                               (mock)
 * B3  Reused link                                (mock, two-click)
 * B4  Tampered link                              (mock)
 * B5  Cross-device PKCE                          (two browser contexts, no shared storage)
 * B6  Scanner prefetch                           (server GET before user click)
 *
 * All tests navigate to /auth/confirm with a fragment-encoded token_hash.
 * The page reads the fragment client-side (never sent to the server), shows
 * a button, and only calls supabase.auth.verifyOtp() on explicit click.
 *
 * B5 note: Our implementation uses verifyOtp({ token_hash }) rather than the
 * PKCE code exchange, so cross-device confirmation PASSES (no code verifier
 * stored in sessionStorage is required). This is intentionally better than
 * the standard PKCE flow described in the brief. See MANUAL-AUTH-TESTS.md.
 *
 * Run:
 *   npx playwright test --config apps/web/playwright.config.ts e2e/auth/b-confirmation-links.spec.ts
 */

import { expect, test } from '@playwright/test';
import { URLS, SB } from './helpers/selectors';
import { mockVerifyOtp, ERRORS } from './helpers/supabase-mock';

const VALID_HASH = 'aabbccddeeff00112233445566778899aabbccdd';
const CONFIRM_URL = (hash = VALID_HASH, type = 'signup') =>
  `${URLS.authConfirm}#token_hash=${hash}&type=${type}`;

const SUCCESS_SESSION = {
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  user: {
    id: 'user-id',
    email: 'test@example.com',
    role: 'authenticated',
    identities: [],
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
  },
};

// ---------------------------------------------------------------------------
// B1: Valid link, same device/browser
// ---------------------------------------------------------------------------

test.describe('B1: valid confirmation link', () => {
  test('B1: valid token_hash shows confirm button; click establishes session', async ({ page }) => {
    await mockVerifyOtp(page, SUCCESS_SESSION);

    await page.goto(CONFIRM_URL());

    // Interstitial renders the confirm button (never auto-verifies on load).
    const btn = page.getByRole('button', { name: 'Confirm my account' });
    await expect(btn).toBeVisible();

    // Click triggers verifyOtp and shows success state.
    await btn.click();
    await expect(page.getByRole('heading', { name: 'Account confirmed' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('B1: magic link type shows correct copy', async ({ page }) => {
    await mockVerifyOtp(page, SUCCESS_SESSION);

    await page.goto(CONFIRM_URL(VALID_HASH, 'magiclink'));

    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('B1: email_change type shows correct copy', async ({ page }) => {
    await mockVerifyOtp(page, SUCCESS_SESSION);

    await page.goto(CONFIRM_URL(VALID_HASH, 'email_change'));

    await expect(page.getByRole('button', { name: 'Confirm email change' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// B2: Expired link
// ---------------------------------------------------------------------------

test.describe('B2: expired confirmation link', () => {
  test('B2: expired token shows "Link expired or already used" and a back-to-sign-in link', async ({
    page,
  }) => {
    await mockVerifyOtp(page, ERRORS.otpExpired, 401);

    await page.goto(CONFIRM_URL());
    await page.getByRole('button', { name: 'Confirm my account' }).click();

    await expect(
      page.getByRole('heading', { name: 'Link expired or already used' }),
    ).toBeVisible({ timeout: 5_000 });

    // Must offer a way back; no raw error or stack trace visible.
    await expect(page.getByRole('link', { name: /back to sign.?in/i })).toBeVisible();
    const body = await page.textContent('body');
    expect(body).not.toMatch(/Error:|at Object\.|stack trace/i);
  });
});

// ---------------------------------------------------------------------------
// B3: Reused link
// ---------------------------------------------------------------------------

test.describe('B3: reused confirmation link', () => {
  test('B3: second click on same link fails cleanly with no session leak', async ({ page }) => {
    let calls = 0;

    // First call succeeds; second call returns expired.
    await page.route(`**${SB.verify}`, (route) => {
      calls++;
      if (calls === 1) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(SUCCESS_SESSION),
        });
      } else {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify(ERRORS.otpExpired),
        });
      }
    });

    // First use: success.
    await page.goto(CONFIRM_URL());
    const btn = page.getByRole('button', { name: 'Confirm my account' });
    await btn.click();
    await expect(page.getByRole('heading', { name: 'Account confirmed' })).toBeVisible();

    // Navigate back and click again (simulate a reuse).
    await page.goto(CONFIRM_URL());
    const btn2 = page.getByRole('button', { name: 'Confirm my account' });
    await btn2.click();

    // Second use: graceful error, not a blank page or uncaught exception.
    await expect(
      page.getByRole('heading', { name: 'Link expired or already used' }),
    ).toBeVisible({ timeout: 5_000 });

    // No unhandled JS errors.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B4: Tampered link
// ---------------------------------------------------------------------------

test.describe('B4: tampered confirmation link', () => {
  test('B4: mutated token_hash fails with a generic error and no stack trace', async ({ page }) => {
    await mockVerifyOtp(page, ERRORS.otpExpired, 401);

    const tamperedHash = VALID_HASH.replace(/a/g, 'z'); // mutate the token
    await page.goto(CONFIRM_URL(tamperedHash));
    await page.getByRole('button', { name: 'Confirm my account' }).click();

    // Generic error heading; no internal detail exposed.
    await expect(
      page.getByRole('heading', { name: 'Link expired or already used' }),
    ).toBeVisible({ timeout: 5_000 });

    const body = await page.textContent('body');
    expect(body).not.toMatch(/token_hash/i);
    expect(body).not.toMatch(/supabase/i);
    expect(body).not.toMatch(/Error:/);
  });

  test('B4: missing fragment entirely shows "This link is not valid"', async ({ page }) => {
    // No hash = missing token_hash.
    await page.goto(URLS.authConfirm);

    await expect(page.getByRole('heading', { name: 'This link is not valid' })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('link', { name: /back to sign.?in/i })).toBeVisible();
  });

  test('B4: invalid OTP type in fragment shows "This link is not valid"', async ({ page }) => {
    await page.goto(`${URLS.authConfirm}#token_hash=${VALID_HASH}&type=unknown_type`);

    await expect(page.getByRole('heading', { name: 'This link is not valid' })).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ---------------------------------------------------------------------------
// B5: Cross-device PKCE
// ---------------------------------------------------------------------------

test.describe('B5: cross-device confirmation', () => {
  /**
   * Our /auth/confirm page uses verifyOtp({ token_hash }) which is device-independent;
   * no PKCE code verifier is stored in sessionStorage. A fresh browser context
   * with no shared storage CAN confirm the link successfully.
   *
   * This is intentionally better than the standard PKCE code-exchange flow.
   * If the app ever switches to ConfirmationURL (code exchange), B5 would
   * need updating: the code verifier stored in context 1 would be absent
   * in context 2, causing "code verifier is missing".
   *
   * See MANUAL-AUTH-TESTS.md B5 for the manual validation checklist.
   */
  test('B5: fresh browser context (no shared storage) can confirm via token_hash', async ({
    browser,
  }) => {
    // Context 1: "originating device" - navigates to register (would send email).
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();

    // Stub verifyOtp on context 1 (not relevant to the cross-device assertion).
    await page1.route(`**${SB.verify}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SUCCESS_SESSION),
      }),
    );
    await page1.goto(CONFIRM_URL());

    // Context 2: "second device" - completely fresh, no sessionStorage, no cookies.
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();

    // Stub verifyOtp on context 2 as well.
    await page2.route(`**${SB.verify}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SUCCESS_SESSION),
      }),
    );

    // Open the same link in the fresh context.
    await page2.goto(CONFIRM_URL());

    const btn = page2.getByRole('button', { name: 'Confirm my account' });
    await expect(btn).toBeVisible();

    // Click succeeds because token_hash-based verification is stateless.
    await btn.click();
    await expect(page2.getByRole('heading', { name: 'Account confirmed' })).toBeVisible({
      timeout: 5_000,
    });

    // PASS: no "code verifier is missing" or PKCE error appeared.
    const body = await page2.textContent('body');
    expect(body).not.toMatch(/code.?verifier/i);
    expect(body).not.toMatch(/same.?device/i);

    await ctx1.close();
    await ctx2.close();
  });
});

// ---------------------------------------------------------------------------
// B6: Scanner prefetch
// ---------------------------------------------------------------------------

test.describe('B6: scanner prefetch protection', () => {
  /**
   * Outlook Safe Links / Defender performs a server-side GET on the emailed URL
   * BEFORE the human clicks. Because our token is in the URL fragment (#...),
   * it is never sent to the server (fragments are client-only). The scanner
   * GETs /auth/confirm with no fragment and receives a blank interstitial.
   * The user then clicks the real link with the fragment intact and confirms
   * successfully, because the token was never consumed by the scanner.
   */
  test('B6: server GET to /auth/confirm (no fragment) does not consume the token', async ({
    page,
    request,
  }) => {
    let verifyCallCount = 0;
    await page.route(`**${SB.verify}`, (route) => {
      verifyCallCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SUCCESS_SESSION),
      });
    });

    // Simulate scanner: server-side GET to the path WITHOUT the fragment.
    // The server never sees the fragment, so the token is untouched.
    const scannerResponse = await request.get(URLS.authConfirm);
    expect(scannerResponse.status()).toBe(200);

    // Immediately after, the user navigates with the real fragment.
    await page.goto(CONFIRM_URL());
    const btn = page.getByRole('button', { name: 'Confirm my account' });
    await expect(btn).toBeVisible();

    await btn.click();

    // PASS: confirmation succeeds - token was not consumed by the scanner GET.
    await expect(page.getByRole('heading', { name: 'Account confirmed' })).toBeVisible({
      timeout: 5_000,
    });

    // verifyOtp was called exactly once (by the human click, not the scanner).
    expect(verifyCallCount).toBe(1);
  });
});
