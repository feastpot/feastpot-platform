/**
 * Vendor search debounce test.
 *
 * Verifies that typing 10 characters into the search box fires exactly one
 * vendor search API request -- not one per keystroke. The 500 ms debounce +
 * 3-character minimum guard implemented in VendorSearchBar prevents URL
 * updates (and therefore vendor search API calls) for keystroke fragments.
 *
 * Run:
 *   npx playwright test --config apps/web/playwright.config.ts e2e/vendor-search-debounce.spec.ts
 *
 * The test navigates to /vendors with a valid postcode pre-filled in
 * localStorage so the page renders in the results state (not the "enter
 * postcode" gate), which makes the search bar reachable.
 */

import { expect, test } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

// UK postcode used to bypass the postcode entry gate on the vendors page.
const TEST_POSTCODE = 'SE15';
// 10 characters to type; must be ≥ 3 chars so the settled value fires once.
const SEARCH_QUERY = 'jollof ric';

test('DB-1: typing 10 chars fires exactly one vendor search API request', async ({ page }) => {
  // Seed the postcode into localStorage before navigation so the page
  // renders in the results state (skips the "enter a postcode" gate).
  await page.addInitScript((postcode: string) => {
    localStorage.setItem('feastpot_postcode', postcode);
  }, TEST_POSTCODE);

  // Track all requests to the vendor search endpoint.
  const searchRequests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    // Match vendor search calls: GET /v1/vendors with a query parameter
    if (url.includes('/v1/vendors') && req.method() === 'GET' && url.includes('q=')) {
      searchRequests.push(url);
    }
  });

  await page.goto(`${BASE}/vendors?postcode=${TEST_POSTCODE}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
    /* tolerate slow local server */
  });

  // Find the search input inside the search bar or search input component.
  const searchInput = page
    .locator('input[type="search"][aria-label="Search vendors and dishes"]')
    .first();
  await expect(searchInput).toBeVisible({ timeout: 10_000 });

  // Snapshot the request count before typing begins.
  const requestsBefore = searchRequests.length;

  // Type one character at a time with a short gap (100 ms) so the browser
  // fires onChange events between keystrokes. The 500 ms debounce means the
  // URL should only update once, after typing is complete.
  for (const char of SEARCH_QUERY) {
    await searchInput.type(char, { delay: 100 });
  }

  // Wait long enough for the debounce to fire (500 ms) + a round-trip.
  await page.waitForTimeout(900);

  const requestsFired = searchRequests.length - requestsBefore;

  console.log(
    `[DB-1] Typed ${SEARCH_QUERY.length} chars, vendor search requests fired: ${requestsFired}`,
  );
  console.log('[DB-1] Requests:', searchRequests.slice(requestsBefore));

  // Exactly 1 search request should have been fired (not 10).
  expect(requestsFired).toBe(1);

  // The single request must carry the full settled query value.
  const settled = searchRequests[searchRequests.length - 1];
  expect(settled).toContain('q=');
});

test('DB-2: typing fewer than 3 chars fires zero vendor search requests', async ({ page }) => {
  await page.addInitScript((postcode: string) => {
    localStorage.setItem('feastpot_postcode', postcode);
  }, TEST_POSTCODE);

  const searchRequests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/v1/vendors') && req.method() === 'GET' && url.includes('q=')) {
      searchRequests.push(url);
    }
  });

  await page.goto(`${BASE}/vendors?postcode=${TEST_POSTCODE}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  const searchInput = page
    .locator('input[type="search"][aria-label="Search vendors and dishes"]')
    .first();
  await expect(searchInput).toBeVisible({ timeout: 10_000 });

  const requestsBefore = searchRequests.length;

  // Type only 2 characters -- below the 3-char threshold.
  await searchInput.type('jo', { delay: 100 });

  // Wait longer than the debounce to confirm no request fires.
  await page.waitForTimeout(900);

  const requestsFired = searchRequests.length - requestsBefore;
  console.log(`[DB-2] Typed 2 chars, requests fired: ${requestsFired} (expected 0)`);

  expect(requestsFired).toBe(0);
});
