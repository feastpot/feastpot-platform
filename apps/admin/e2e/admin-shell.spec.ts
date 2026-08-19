import { expect, test } from '@playwright/test';

/**
 * Admin shell smoke tests.
 *
 * Every authenticated admin route must render inside StaffShell -- identified
 * by the <aside aria-label="Admin console navigation"> element that AdminShell
 * always renders. A missing sidebar means the page was inadvertently returned
 * without the StaffShell wrapper (as was the case for /dead-letters before
 * this regression suite was added).
 *
 * These tests require the admin app to be running locally
 * (npm run dev --workspace=@feastpot/admin) and a valid storageState produced
 * by the auth setup project. They are skipped automatically when
 * TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD are not set.
 *
 * ALLOWLIST -- routes intentionally rendered WITHOUT StaffShell:
 *   /sign-in     -- unauthenticated landing page
 *   /unauthorized -- error page shown before auth is established
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3003';

// Routes to visit and assert the shell exists.
// Add new routes here when new pages are created.
const SHELL_ROUTES = [
  '/',
  '/analytics',
  '/attribution',
  '/audit-log',
  '/catering-bookings',
  '/catering-enquiries',
  '/chargebacks',
  '/commission-rates',
  '/compliance',
  '/coverage',
  '/dead-letters',
  '/discount-codes',
  '/disputes',
  '/error-incidents',
  '/events',
  '/feastpass-health',
  '/legal',
  '/menus/queue',
  '/notifications',
  '/orders',
  '/payouts',
  '/settings',
  '/settings/2fa',
  '/user-guide',
  '/users',
  '/vendor-applications',
  '/vendor-recommendations',
  '/vendors',
  '/waitlist',
];

// Routes that render without StaffShell by design.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SHELL_EXEMPT = [
  '/sign-in', // unauthenticated landing -- no sidebar expected
  '/unauthorized', // pre-auth error page -- no sidebar expected
];

async function skipIfUnauthenticated(page: import('@playwright/test').Page, path: string) {
  await page.goto(`${BASE}${path}`);
  const url = page.url();
  if (url.includes('/sign-in')) {
    test.skip(true, 'Not authenticated -- set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run');
  }
}

// ─── S1: Every shell route renders the sidebar ───────────────────────────────

for (const route of SHELL_ROUTES) {
  test(`S1 - ${route} renders admin sidebar (StaffShell)`, async ({ page }) => {
    await skipIfUnauthenticated(page, route);

    await page.waitForLoadState('domcontentloaded');

    // The AdminShell always renders this aside element.
    const sidebar = page.locator('aside[aria-label="Admin console navigation"]');
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    console.log(`[S1] ${route}: sidebar present`);
  });
}
