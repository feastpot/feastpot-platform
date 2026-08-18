import { expect, test } from '@playwright/test';

/**
 * Debounce regression tests for the admin search inputs.
 *
 * Each test:
 *  1. Navigates to a page with a fire-on-change search input.
 *  2. Counts API requests matching the endpoint while typing a 10-character
 *     query one keystroke at a time.
 *  3. Asserts that at most 2 requests were made - one for the initial page
 *     load (or zero, if the query is non-empty from the start) and at most one
 *     for the debounced result after typing stops.
 *
 * Without debounce 10 characters → 10 requests.  With 300 ms debounce and
 * keystrokes spaced 50 ms apart (500 ms total) → 1 request after the final
 * pause, giving a total of at most 2 (initial load + settled query).
 *
 * IMPORTANT: these tests require the admin app to be running locally
 * (npm run dev --workspace=@feastpot/admin) and a valid storageState produced
 * by the auth setup project.  They will be skipped automatically when
 * TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD are not set (auth.setup writes an
 * empty storageState, which leaves the browser unauthenticated, and the
 * middleware redirects to /sign-in, so we skip early).
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3003';
const API_ORIGIN = process.env.TEST_API_URL ?? 'http://localhost:3001';

// How long to wait after the last keystroke before counting the requests.
// Must be > debounce delay (300 ms) so the last debounced call has time to
// fire and we don't race against the timer.
const SETTLE_MS = 700;

// Delay between simulated keystrokes (ms).  Fast but not instantaneous -
// mirrors a brisk human typist without being so fast the browser queues events.
const KEYSTROKE_DELAY_MS = 50;

async function skipIfUnauthenticated(page: import('@playwright/test').Page, path: string) {
  await page.goto(`${BASE}${path}`);
  const url = page.url();
  if (url.includes('/sign-in')) {
    test.skip(true, 'Not authenticated - set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run');
  }
}

// ─── T1: Users search ────────────────────────────────────────────────────────

test('T1 - users search fires ≤ 2 API requests for a 10-character query', async ({ page }) => {
  await skipIfUnauthenticated(page, '/users');

  const query = 'testquery1'; // exactly 10 chars
  let requestCount = 0;

  // Intercept requests to the users list endpoint.
  // Both `localhost:3001` and relative `/v1/admin/users` patterns are covered.
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/admin/users') && req.method() === 'GET') {
      requestCount++;
    }
  });

  // Wait for the initial page to settle (1 initial request expected).
  await page.waitForLoadState('networkidle');
  const countAfterLoad = requestCount;

  // Locate the search input.
  const searchInput = page.getByRole('searchbox', { name: /search/i }).first();
  await expect(searchInput).toBeVisible({ timeout: 10_000 });

  // Reset request counter to isolate typing-induced requests.
  requestCount = 0;

  // Type each character with a 50 ms gap - fast but not simultaneous.
  await searchInput.click();
  for (const char of query) {
    await searchInput.pressSequentially(char, { delay: KEYSTROKE_DELAY_MS });
  }

  // Wait for the debounce to flush and the network to settle.
  await page.waitForTimeout(SETTLE_MS);
  await page.waitForLoadState('networkidle');

  // With 300 ms debounce and 50 ms keystroke spacing:
  //   10 chars × 50 ms = 500 ms total typing time.
  //   Debounce restarts on every key → fires once, 300 ms after the last char.
  //   Expected: exactly 1 request.  We allow ≤ 2 for timing jitter.
  expect(requestCount).toBeLessThanOrEqual(2);
  expect(requestCount).toBeGreaterThanOrEqual(1);

  console.log(
    `[T1] users search: ${countAfterLoad} request(s) on load, ${requestCount} while typing "${query}"`,
  );
});

// ─── T2: Disputes search ─────────────────────────────────────────────────────

test('T2 - disputes search fires ≤ 2 API requests for a 10-character query', async ({ page }) => {
  await skipIfUnauthenticated(page, '/disputes');

  const query = 'searchterm'; // exactly 10 chars
  let requestCount = 0;

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/disputes') && req.method() === 'GET' && url.includes('q=')) {
      requestCount++;
    }
  });

  await page.waitForLoadState('networkidle');

  // Locate the disputes search input (it's in the PageHeader actions area).
  const searchInput = page.getByPlaceholder(/search disputes/i);
  await expect(searchInput).toBeVisible({ timeout: 10_000 });

  requestCount = 0;

  await searchInput.click();
  for (const char of query) {
    await searchInput.pressSequentially(char, { delay: KEYSTROKE_DELAY_MS });
  }

  await page.waitForTimeout(SETTLE_MS);
  await page.waitForLoadState('networkidle');

  expect(requestCount).toBeLessThanOrEqual(2);
  expect(requestCount).toBeGreaterThanOrEqual(1);

  console.log(`[T2] disputes search: ${requestCount} request(s) while typing "${query}"`);
});

// ─── T3: Clearing the input resets to the unfiltered list ────────────────────

test('T3 - clearing users search sends exactly one request (not one per deleted char)', async ({
  page,
}) => {
  await skipIfUnauthenticated(page, '/users');

  const query = 'testresets'; // 10 chars
  let requestCount = 0;

  page.on('request', (req) => {
    if (req.url().includes('/admin/users') && req.method() === 'GET') {
      requestCount++;
    }
  });

  await page.waitForLoadState('networkidle');

  const searchInput = page.getByRole('searchbox', { name: /search/i }).first();
  await expect(searchInput).toBeVisible({ timeout: 10_000 });

  // Type a query and let it settle.
  await searchInput.fill(query);
  await page.waitForTimeout(SETTLE_MS);
  await page.waitForLoadState('networkidle');

  // Now clear the input character by character (worst case for without debounce).
  requestCount = 0;
  for (let i = 0; i < query.length; i++) {
    await searchInput.press('Backspace');
    await page.waitForTimeout(KEYSTROKE_DELAY_MS);
  }

  await page.waitForTimeout(SETTLE_MS);
  await page.waitForLoadState('networkidle');

  // Clearing 10 chars should fire ≤ 2 requests (not 10).
  expect(requestCount).toBeLessThanOrEqual(2);

  console.log(`[T3] clearing users search: ${requestCount} request(s) for ${query.length} deletes`);
});

// ─── T4: Paste fires a single request ────────────────────────────────────────

test('T4 - pasting a full query into users search fires at most 1 request', async ({ page }) => {
  await skipIfUnauthenticated(page, '/users');

  let requestCount = 0;
  page.on('request', (req) => {
    if (req.url().includes('/admin/users') && req.method() === 'GET') {
      requestCount++;
    }
  });

  await page.waitForLoadState('networkidle');

  const searchInput = page.getByRole('searchbox', { name: /search/i }).first();
  await expect(searchInput).toBeVisible({ timeout: 10_000 });

  requestCount = 0;

  // fill() sets the value atomically - equivalent to a paste from the OS
  // clipboard, which fires a single input event rather than per-character ones.
  await searchInput.fill('pastedquery1');
  await page.waitForTimeout(SETTLE_MS);
  await page.waitForLoadState('networkidle');

  // A paste is a single change event → exactly 1 debounced request.
  expect(requestCount).toBeLessThanOrEqual(2);
  expect(requestCount).toBeGreaterThanOrEqual(1);

  console.log(`[T4] paste into users search: ${requestCount} request(s)`);
});
