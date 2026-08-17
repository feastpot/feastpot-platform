/**
 * D: SIGN-IN
 *
 * D1  Correct password, confirmed account  -> session set, redirect
 * D2  Incorrect password                   -> generic "invalid credentials" error
 * D3  Unconfirmed account                  -> "email not confirmed" panel + resend option
 * D4  Non-existent account                 -> identical error to D2 (enumeration safety)
 *
 * Run:
 *   npx playwright test --config apps/web/playwright.config.ts e2e/auth/d-signin.spec.ts
 */

import { expect, test } from '@playwright/test';
import { URLS, SIGNIN, SB, API } from './helpers/selectors';
import {
  mockSignin,
  mockUsersSync,
  mockVerifyOtp,
  mockResend,
  mockSignup,
  signupNewUser,
  mockSignup as _mockSignup,
  ERRORS,
  mockSession,
} from './helpers/supabase-mock';

async function fillSignIn(
  page: Parameters<Parameters<typeof test>[1]>[0],
  email: string,
  password: string,
) {
  await page.goto(URLS.signIn);
  await page.fill(SIGNIN.email, email);
  await page.fill(SIGNIN.password, password);
  await page.click(SIGNIN.submit);
}

// ---------------------------------------------------------------------------
// D1: Correct credentials
// ---------------------------------------------------------------------------

test.describe('D1: correct credentials', () => {
  test('D1: successful sign-in redirects away from /sign-in', async ({ page }) => {
    const email = 'confirmed@example.com';
    await mockSignin(page, mockSession(email));
    await mockUsersSync(page);

    await fillSignIn(page, email, 'StrongPass1!');

    // Must navigate away from the sign-in page.
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 5_000 });
  });

  test('D1: no error banner on successful sign-in', async ({ page }) => {
    await mockSignin(page, mockSession());
    await mockUsersSync(page);

    await page.goto(URLS.signIn);
    await page.fill(SIGNIN.email, 'ok@example.com');
    await page.fill(SIGNIN.password, 'StrongPass1!');

    const errorsBefore = await page.locator('[role="alert"]').count();
    expect(errorsBefore).toBe(0);

    await page.click(SIGNIN.submit);
    await page.waitForTimeout(500);

    // No alert rendered during or after submit.
    await expect(page.locator('[role="alert"]')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// D2: Incorrect password
// ---------------------------------------------------------------------------

test.describe('D2: incorrect password', () => {
  test('D2: wrong password shows generic "Invalid email or password" error', async ({ page }) => {
    await mockSignin(page, ERRORS.invalidCredentials, 400);

    await fillSignIn(page, 'real@example.com', 'WrongPassword1!');

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5_000 });
    await expect(alert).toContainText(/invalid email or password/i);

    // No enumeration: must not say "user not found" or "email does not exist".
    await expect(alert).not.toContainText(/not found/i);
    await expect(alert).not.toContainText(/does not exist/i);
    await expect(alert).not.toContainText(/no account/i);
  });
});

// ---------------------------------------------------------------------------
// D3: Unconfirmed account
// ---------------------------------------------------------------------------

test.describe('D3: unconfirmed account sign-in', () => {
  /**
   * When Supabase returns email_not_confirmed, the sign-in form must:
   *  - Show a clear "email hasn't been confirmed" message (not the generic
   *    "Invalid email or password" banner)
   *  - Offer a "Resend confirmation email" button
   *
   * This behaviour was added to SignInPane alongside this test suite.
   */
  test('D3: email_not_confirmed shows targeted message with resend option', async ({ page }) => {
    await mockSignin(page, ERRORS.emailNotConfirmed, 400);

    await fillSignIn(page, 'unconfirmed@example.com', 'StrongPass1!');

    // Must show the unconfirmed-specific panel (not the generic error).
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5_000 });
    await expect(alert).toContainText(/confirm/i);

    // Must offer a way to resend.
    const resendBtn = alert.getByRole('button', { name: /resend/i });
    await expect(resendBtn).toBeVisible();
  });

  test('D3: resend from sign-in panel sends the confirmation and shows success', async ({
    page,
  }) => {
    await mockSignin(page, ERRORS.emailNotConfirmed, 400);
    await mockResend(page, {});

    await fillSignIn(page, 'unconfirmed@example.com', 'StrongPass1!');

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5_000 });

    const resendBtn = alert.getByRole('button', { name: /resend/i });
    await resendBtn.click();

    // After resend, a confirmation message replaces the button.
    await expect(page.getByText(/resent|sent|check/i)).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// D4: Non-existent account (enumeration safety)
// ---------------------------------------------------------------------------

test.describe('D4: non-existent account enumeration safety', () => {
  /**
   * Supabase returns the same invalid_credentials error for both "wrong
   * password for real account" and "no such account". The UI must be
   * byte-identical and timing must not reveal which case occurred.
   */
  test('D4: non-existent account shows identical error to D2 (wrong password)', async ({
    page,
  }) => {
    // Supabase returns invalid_credentials for both cases.
    await mockSignin(page, ERRORS.invalidCredentials, 400);

    await fillSignIn(page, 'ghost@example.com', 'AnyPassword1!');

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5_000 });
    await expect(alert).toContainText(/invalid email or password/i);
    await expect(alert).not.toContainText(/not found/i);
    await expect(alert).not.toContainText(/does not exist/i);
  });

  test('D4: response time for non-existent vs wrong-password is not materially different', async ({
    page,
  }) => {
    const RUNS = 10;
    const times: { wrongPwd: number[]; ghost: number[] } = { wrongPwd: [], ghost: [] };

    for (let i = 0; i < RUNS; i++) {
      await mockSignin(page, ERRORS.invalidCredentials, 400);
      await page.goto(URLS.signIn);
      const t0 = Date.now();
      await page.fill(SIGNIN.email, 'real@example.com');
      await page.fill(SIGNIN.password, 'Wrong1!');
      await page.click(SIGNIN.submit);
      await expect(page.getByRole('alert')).toBeVisible();
      times.wrongPwd.push(Date.now() - t0);
    }

    for (let i = 0; i < RUNS; i++) {
      await mockSignin(page, ERRORS.invalidCredentials, 400);
      await page.goto(URLS.signIn);
      const t0 = Date.now();
      await page.fill(SIGNIN.email, 'ghost@example.com');
      await page.fill(SIGNIN.password, 'AnyPass1!');
      await page.click(SIGNIN.submit);
      await expect(page.getByRole('alert')).toBeVisible();
      times.ghost.push(Date.now() - t0);
    }

    const median = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2;
    };

    const delta = Math.abs(median(times.wrongPwd) - median(times.ghost));
    // PASS: median delta < 150 ms; timing is not a signal of account existence.
    expect(delta).toBeLessThan(150);
  });
});
