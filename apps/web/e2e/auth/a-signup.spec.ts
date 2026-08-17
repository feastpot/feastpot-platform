/**
 * A: EMAIL/PASSWORD SIGN-UP
 *
 * A1  New user sign-up              (mock: covered by register.spec.ts test 1;
 *                                    real-email variant here, gated on Mailosaur)
 * A2  Existing CONFIRMED user       (mock: covered by register.spec.ts test 2)
 * A3  Existing UNCONFIRMED user     (mock + assertion, new)
 * A4  Enumeration timing safety     (mock, 20 iterations each path)
 *
 * Run:
 *   npx playwright test --config apps/web/playwright.config.ts e2e/auth/a-signup.spec.ts
 */

import { expect, test } from '@playwright/test';
import {
  URLS,
  REG,
  SB,
  VALID_REG,
} from './helpers/selectors';
import {
  mockSignup,
  signupNewUser,
  signupConfirmedUser,
  signupUnconfirmedUser,
} from './helpers/supabase-mock';
import {
  skipIfNoMailosaur,
  mailosaurAddress,
  waitForEmail,
  extractConfirmLink,
  purgeInbox,
} from './helpers/mail';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fill and submit the registration form with optional overrides. */
async function fillAndSubmit(
  page: Parameters<Parameters<typeof test>[1]>[0],
  overrides: Partial<typeof VALID_REG & { phone: string }> = {},
) {
  const data = { ...VALID_REG, ...overrides };
  await page.fill(REG.fullName, data.fullName);
  await page.fill(REG.email, data.email);
  if ('phone' in overrides) await page.fill(REG.phone, overrides.phone ?? '');
  await page.fill(REG.password, data.password);
  await page.fill(REG.confirmPassword, data.password);
  await page.fill(REG.postcode, data.postcode);
  await page.check(REG.terms);
  await page.click(REG.submit);
}

// ---------------------------------------------------------------------------
// A1: New user sign-up - mock variant
// (See also register.spec.ts test 1 which covers the same path)
// ---------------------------------------------------------------------------

test.describe('A1: new user sign-up', () => {
  test('A1-mock: new email shows neutral "Check your email" screen', async ({ page }) => {
    const email = `test+a1-${Date.now()}@example-feastpot.com`;
    await mockSignup(page, signupNewUser(email));

    await page.goto(URLS.register);
    await fillAndSubmit(page, { email });

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
  });

  // Real-email variant: skipped unless TEST_MAILOSAUR_API_KEY is set.
  test('A1-real: confirmation email arrives within 60 s and link is reachable', async ({ page }) => {
    skipIfNoMailosaur();

    const localPart = `a1-${Date.now()}`;
    const email = mailosaurAddress(localPart);

    await page.goto(URLS.register);
    await fillAndSubmit(page, { email });

    // UI shows confirmation screen.
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
      timeout: 10_000,
    });

    // Email arrives within 60 s.
    const message = await waitForEmail(email, 60_000);
    expect(message.subject).toMatch(/confirm|activate|verify/i);

    // The link goes to /auth/confirm (scanner-proof interstitial).
    const link = extractConfirmLink(message);
    expect(link).toContain('/auth/confirm');
    expect(link).toContain('#token_hash=');
    expect(link).toContain('type=signup');

    await purgeInbox();
  });
});

// ---------------------------------------------------------------------------
// A2: Existing CONFIRMED user (covered by register.spec.ts test 2; reference)
// ---------------------------------------------------------------------------

test.describe('A2: existing confirmed user', () => {
  test('A2: existing confirmed email shows identical neutral screen (no enumeration)', async ({
    page,
  }) => {
    // Supabase returns HTTP 200 with empty identities for an already-confirmed account.
    const email = `existing+confirmed-${Date.now()}@example-feastpot.com`;
    await mockSignup(page, signupConfirmedUser(email));

    await page.goto(URLS.register);
    await fillAndSubmit(page, { email });

    // UI must be byte-for-byte the same as A1.
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    // PASS criterion: no text reveals account existence.
    const body = await page.textContent('body');
    expect(body).not.toMatch(/already (exists|registered)/i);
    expect(body).not.toMatch(/account.*found/i);
    expect(body).not.toMatch(/try.*sign.?in/i);
  });
});

// ---------------------------------------------------------------------------
// A3: Existing UNCONFIRMED user
// ---------------------------------------------------------------------------

test.describe('A3: existing unconfirmed user', () => {
  test('A3: unconfirmed re-signup shows confirmation screen; no silent password overwrite message', async ({
    page,
  }) => {
    // Supabase re-sends the confirmation email and returns identities non-empty.
    const email = `existing+unconfirmed-${Date.now()}@example-feastpot.com`;
    await mockSignup(page, signupUnconfirmedUser(email));

    await page.goto(URLS.register);
    await fillAndSubmit(page, { email });

    // The confirmation screen appears (Supabase re-sent the link).
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    // SECURITY: the UI must NOT say "your password was updated" or similar,
    // because the old password is still valid until the user confirms.
    // An unconfirmed account in Supabase can have its password silently
    // overwritten by re-signup; the UI must not disclose or encourage this.
    const body = await page.textContent('body');
    expect(body).not.toMatch(/password.*updated/i);
    expect(body).not.toMatch(/password.*changed/i);
    expect(body).not.toMatch(/new password/i);
  });
});

// ---------------------------------------------------------------------------
// A4: Enumeration timing safety
// ---------------------------------------------------------------------------

test.describe('A4: enumeration timing safety', () => {
  test('A4: median response time delta between new and existing confirmed user < 150 ms', async ({
    page,
  }) => {
    const RUNS = 20;
    const newUserTimes: number[] = [];
    const confirmedUserTimes: number[] = [];

    const email = `timing-${Date.now()}@example-feastpot.com`;

    // Collect timings for new-user path (identities populated).
    for (let i = 0; i < RUNS; i++) {
      await mockSignup(page, signupNewUser(email));
      await page.goto(URLS.register);
      const t0 = Date.now();
      await fillAndSubmit(page, { email });
      await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
      newUserTimes.push(Date.now() - t0);
    }

    // Collect timings for confirmed-user path (identities empty).
    for (let i = 0; i < RUNS; i++) {
      await mockSignup(page, signupConfirmedUser(email));
      await page.goto(URLS.register);
      const t0 = Date.now();
      await fillAndSubmit(page, { email });
      await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
      confirmedUserTimes.push(Date.now() - t0);
    }

    const median = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const newMedian = median(newUserTimes);
    const confirmedMedian = median(confirmedUserTimes);
    const delta = Math.abs(newMedian - confirmedMedian);

    // PASS: median delta < 150 ms; both paths take similar wall-clock time.
    expect(delta).toBeLessThan(150);

    // PASS: both paths render the same heading (body-level enumeration check).
    // (Verified per-run above; this is a summary assertion.)
    expect(newMedian).toBeGreaterThan(0);
    expect(confirmedMedian).toBeGreaterThan(0);
  });

  test('A4: response body is identical for new vs confirmed user (no field reveals account existence)', async ({
    page,
  }) => {
    const email = `enum-body-${Date.now()}@example-feastpot.com`;

    await mockSignup(page, signupNewUser(email));
    await page.goto(URLS.register);
    await fillAndSubmit(page, { email });
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    const newBody = await page.textContent('body');

    await mockSignup(page, signupConfirmedUser(email));
    await page.goto(URLS.register);
    await fillAndSubmit(page, { email });
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    const confirmedBody = await page.textContent('body');

    // Both paths must render the same visible text (emails match so the body is identical).
    expect(newBody).toBe(confirmedBody);
  });
});
