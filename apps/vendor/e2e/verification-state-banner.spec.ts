/**
 * Verification state banner -- dashboard e2e suite.
 *
 * Tests that the VerificationStateBanner component renders the correct alert
 * on the vendor dashboard for each overallState value, and that the dismiss
 * and action behaviours work correctly.
 *
 * All tests intercept client-side API calls via page.route(). The server-side
 * GET /vendors/me call goes to the real Next.js dev server (which proxies to
 * the NestJS API) using the stored test credentials, so the page renders with
 * a real vendor ID before the client hooks fire against the mocked routes.
 *
 * Run:
 *   npm run test:e2e --workspace=@feastpot/vendor -- --project=verification-state-banner
 */

import { expect, test } from '@playwright/test';

import {
  installVerificationBannerMocks,
  makeEnforcementSuspendedRecord,
  makeRenewalDueRecord,
  makeSuspendedRecord,
  makeVerificationRecord,
} from './helpers/verification-banner-mocks';

// ── VB1: SUSPENDED banner renders ─────────────────────────────────────────────

test('VB1: suspended vendor sees the red non-dismissible banner on the dashboard', async ({
  page,
}) => {
  await installVerificationBannerMocks(page, makeSuspendedRecord());
  await page.goto('/');

  const banner = page.getByTestId('verification-suspended-banner');
  await expect(banner).toBeVisible({ timeout: 6000 });

  // Copy names the consequence, not the enum value.
  await expect(banner).toContainText('not visible to customers');
  await expect(banner).toContainText('cannot receive new orders');

  // Must not contain the raw enum string.
  await expect(banner).not.toContainText('SUSPENDED');

  // Non-dismissible: no dismiss button inside the banner.
  await expect(banner.getByRole('button')).toHaveCount(0);
});

// ── VB2: Self-service action links to /compliance ─────────────────────────────

test('VB2: suspended vendor with expired document gets a /compliance action link', async ({
  page,
}) => {
  // makeSuspendedRecord() sets insuranceValidUntil to 10 days ago.
  await installVerificationBannerMocks(page, makeSuspendedRecord());
  await page.goto('/');

  const banner = page.getByTestId('verification-suspended-banner');
  await expect(banner).toBeVisible({ timeout: 6000 });

  // The action link should go to /compliance (self-service upload).
  const link = banner.getByRole('link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/compliance');
  await expect(link).toContainText('Upload');
});

// ── VB3: Enforcement suspension shows appeals action ──────────────────────────

test('VB3: suspended vendor with no document issue gets an appeals mailto link', async ({
  page,
}) => {
  // makeEnforcementSuspendedRecord() -- all docs valid; enforcement-driven.
  await installVerificationBannerMocks(page, makeEnforcementSuspendedRecord());
  await page.goto('/');

  const banner = page.getByTestId('verification-suspended-banner');
  await expect(banner).toBeVisible({ timeout: 6000 });

  // Action must be a mailto: link to the appeals team.
  const link = banner.getByRole('link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /^mailto:appeals@/);
  await expect(link).toContainText('appeals');
});

// ── VB4: RENEWAL_DUE banner renders ──────────────────────────────────────────

test('VB4: renewal-due vendor sees the amber banner with a date (not a day count) and a dismiss button', async ({
  page,
}) => {
  await installVerificationBannerMocks(page, makeRenewalDueRecord());
  await page.goto('/');

  const banner = page.getByTestId('verification-renewal-banner');
  await expect(banner).toBeVisible({ timeout: 6000 });

  // Copy names the consequence.
  await expect(banner).toContainText('stop taking orders');

  // Must not contain the raw enum string.
  await expect(banner).not.toContainText('RENEWAL_DUE');

  // Deadline is shown as a date ("September 2026") not "in N days".
  // makeRenewalDueRecord sets insurance to expire in 20 days.
  // We check for a month name to confirm it is a human-readable date.
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const bannerText = await banner.textContent();
  const hasMonthName = monthNames.some((m) => bannerText?.includes(m));
  expect(hasMonthName, 'Banner should contain a month name (date, not day count)').toBe(true);

  // Dismiss button is present.
  const dismissBtn = banner.getByTestId('renewal-dismiss');
  await expect(dismissBtn).toBeVisible();
});

// ── VB5: RENEWAL_DUE banner dismiss persists for the session ──────────────────

test('VB5: dismissed renewal banner stays hidden after a page reload within the same session', async ({
  page,
}) => {
  await installVerificationBannerMocks(page, makeRenewalDueRecord());
  await page.goto('/');

  const banner = page.getByTestId('verification-renewal-banner');
  await expect(banner).toBeVisible({ timeout: 6000 });

  // Dismiss the banner.
  await banner.getByTestId('renewal-dismiss').click();
  await expect(banner).not.toBeVisible();

  // Reload -- mocks need reinstalling since page.route handlers don't survive reload.
  await installVerificationBannerMocks(page, makeRenewalDueRecord());
  await page.reload();

  // Banner should not reappear (sessionStorage persists across reloads).
  // Wait a moment for the hook to settle.
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('verification-renewal-banner')).not.toBeVisible();
});

// ── VB6: VERIFIED -- no banner ─────────────────────────────────────────────────

test('VB6: verified vendor sees no verification banner on the dashboard', async ({ page }) => {
  await installVerificationBannerMocks(page, makeVerificationRecord({ overallState: 'VERIFIED' }));
  await page.goto('/');

  // Wait for the dashboard to load (ComplianceAlerts settling is a proxy).
  await page.waitForTimeout(2000);

  await expect(page.getByTestId('verification-suspended-banner')).not.toBeVisible();
  await expect(page.getByTestId('verification-renewal-banner')).not.toBeVisible();
});

// ── VB7: SUSPENDED takes priority over RENEWAL_DUE ────────────────────────────

test('VB7: when overallState is SUSPENDED only the red banner shows, never the amber renewal banner', async ({
  page,
}) => {
  // A suspended record already implies documents expired; it should show
  // the suspended (red) banner only, not the renewal (amber) one.
  await installVerificationBannerMocks(page, makeSuspendedRecord());
  await page.goto('/');

  const suspendedBanner = page.getByTestId('verification-suspended-banner');
  await expect(suspendedBanner).toBeVisible({ timeout: 6000 });

  // The renewal banner must not also appear.
  await expect(page.getByTestId('verification-renewal-banner')).not.toBeVisible();
});
