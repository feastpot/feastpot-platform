import { expect, test } from '@playwright/test';

/**
 * Vendors page smoke tests.
 *
 * Verifies that the Vendors page renders its content on first load --
 * no tab click required -- after the default was changed from 'pending'
 * to 'all'. The 'all' tab shows every vendor regardless of status, so
 * a seeded dev environment will always have rows visible immediately.
 *
 * These tests require the admin app to be running locally
 * (npm run dev --workspace=@feastpot/admin) and a valid storageState
 * produced by the auth setup project. They are skipped automatically
 * when TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD are not set.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3003';

async function skipIfUnauthenticated(page: import('@playwright/test').Page, path: string) {
  await page.goto(`${BASE}${path}`);
  const url = page.url();
  if (url.includes('/sign-in')) {
    test.skip(true, 'Not authenticated -- set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run');
  }
}

// ─── V1: Vendors page shows content without a tab click ──────────────────────

test('V1 - vendors page renders vendor rows on first load (no tab click required)', async ({
  page,
}) => {
  await skipIfUnauthenticated(page, '/vendors');

  // Wait for the page to fully load -- data from the API must arrive.
  await page.waitForLoadState('networkidle');

  // The table should be visible without any interaction.
  const table = page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 10_000 });

  // At least one data row (tr inside tbody) should be present.
  // The seed environment has 20+ vendors visible under the 'all' tab.
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();

  // We expect seed data; if the DB is empty the test is still valid
  // because the empty state renders inside the table -- not outside it.
  // The critical assertion is that NO tab click was needed to see the table.
  expect(rowCount).toBeGreaterThanOrEqual(1);

  console.log(`[V1] vendors page: ${rowCount} row(s) visible on first load (no tab click)`);
});

// ─── V2: Tab pills have numeric count badges ──────────────────────────────────

test('V2 - vendor tab pills show numeric count badges', async ({ page }) => {
  await skipIfUnauthenticated(page, '/vendors');

  await page.waitForLoadState('networkidle');

  // The count badges are rendered as small <span> elements inside the tab
  // buttons. Wait for at least one badge to become non-empty.
  // Counts come from /admin/vendors/counts which loads asynchronously.
  await page.waitForFunction(
    () => {
      const buttons = document.querySelectorAll('[role="tablist"] button');
      return Array.from(buttons).some((b) => {
        const spans = b.querySelectorAll('span');
        return Array.from(spans).some(
          (s) => s.textContent !== null && /^\d+$/.test(s.textContent.trim()),
        );
      });
    },
    { timeout: 10_000 },
  );

  // At least one tab pill must contain a digit.
  const pillsWithCounts = page.locator('[role="tablist"] button span').filter({
    hasText: /^\d+$/,
  });
  const countBadges = await pillsWithCounts.count();
  expect(countBadges).toBeGreaterThanOrEqual(1);

  console.log(`[V2] vendors page: ${countBadges} tab pill(s) with numeric count badge`);
});
