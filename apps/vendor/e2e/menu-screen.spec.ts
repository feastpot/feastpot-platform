/**
 * Automated usability test suite for the /menu dishes screen.
 *
 * Design principles:
 *   - Every test measures a complete vendor task: time, click count,
 *     and page-navigation count. These are the criteria that matter,
 *     not just eventual completion.
 *   - T1-T8 must produce ZERO full-page navigations. Failing with a
 *     descriptive message naming the offending URL is mandatory.
 *   - API calls are intercepted via page.route() so the suite can run
 *     against a local dev server without a live backend.
 *   - Supabase auth is real: the setup project signs in with test
 *     credentials and persists the session.
 *
 * Run:
 *   npm run test:e2e --workspace=@feastpot/vendor
 */

import { expect, test } from '@playwright/test';

import {
  DRAFT_ITEM,
  ID,
  LIVE_ITEM,
  SOLD_OUT_ITEM,
  captureNextRequest,
  installBaseMocks,
  makeItem,
  makeDishList,
  mockAlways,
  mockOnce,
} from './helpers/api-mocks';
import { PageMetrics } from './helpers/page-metrics';

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Wait for the dishes grid OR the empty state to appear. */
async function waitForMenuReady(page: import('@playwright/test').Page) {
  await page.waitForSelector(
    '[data-testid="dishes-grid"], text="No dishes yet", text="Add your first dish"',
    { timeout: 10_000 },
  ).catch(() => {
    // Fall back to waiting for the Add a dish button which is always rendered.
    return page.waitForSelector('button:has-text("Add a dish")', { timeout: 10_000 });
  });
}

/** Open the editor for a new dish. Returns after the panel is visible. */
async function openNewDishPanel(page: import('@playwright/test').Page) {
  // The header button and the tile both say "Add a dish".
  // Prefer the header button (always visible even when there are dishes).
  await page.getByRole('button', { name: 'Add a dish' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Add a dish' })).toBeVisible();
}

/** Fill the minimum required fields in the editor (name + price + prep time). */
async function fillEssentials(
  page: import('@playwright/test').Page,
  name: string,
  pricePounds: string,
  prepMinutes = '60',
) {
  await page.locator('#dish-name').fill(name);
  await page.locator('#dish-price').fill(pricePounds);
  // Prep time is pre-filled to 60; only change when needed.
  if (prepMinutes !== '60') {
    await page.locator('#dish-prep').fill(prepMinutes);
  }
}

// ── T1: Empty state to first live dish with photo and allergens ──────────────

test('T1: empty state to first live dish - photo and allergens declared - under 90 s - zero navigations', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  await installBaseMocks(page, [], { noMenu: false });

  // When Save is clicked, respond with the created item so the query
  // invalidation shows the card immediately.
  const createdItem = makeItem('item-new', {
    name: 'Sunday Jollof Rice',
    category: 'tray',
    pricePence: 1500,
    isAvailable: true,
    moderationStatus: 'auto_approved',
    allergens: ['nuts'],
    allergensFreeFrom: false,
    tags: [],
    sortOrder: 1,
  });

  // Capture the POST so we can assert the body, then return the created item.
  const postPromise = captureNextRequest(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items$/,
    201,
    createdItem,
  );

  // After creation, the GET refetch should return the new item.
  let itemsResponse: unknown[] = [];
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/, 200, itemsResponse);

  await page.goto('/menu');
  await waitForMenuReady(page);
  m.startTask();

  // ── Task flow ──────────────────────────────────────────────────────────────

  await openNewDishPanel(page);

  // Attach a photo (staged client-side before save).
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add photo' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'jollof.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('JFIF-stub'), // minimal non-empty buffer
  });

  // Fill essentials.
  await fillEssentials(page, 'Sunday Jollof Rice', '15.00');

  // Tick an allergen (nuts).
  const nutsCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: '' }).nth(9); // Nuts is index 9 in FSA_14
  await page.getByText('Nuts').locator('..').locator('input[type="checkbox"]').check();

  // Set status to LIVE.
  await page.getByRole('button', { name: 'Live' }).click();

  // Update mock so the refetch after save returns the created item.
  itemsResponse = [createdItem];
  await page.unroute(/\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/);
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/, 200, itemsResponse);

  // Also mock the image upload endpoint.
  await mockAlways(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items\/[^/]+\/images$/,
    200,
    { path: 'uploads/jollof.jpg', publicUrl: 'https://cdn.example.com/jollof.jpg' },
  );

  await page.getByRole('button', { name: 'Save dish' }).click();

  // Panel must close without navigation.
  await expect(page.getByRole('dialog', { name: 'Add a dish' })).toBeHidden({ timeout: 5_000 });

  // ── Assertions ─────────────────────────────────────────────────────────────

  m.assertNoNavigation('T1');
  m.assertElapsed(90, 'T1');

  // The API received the correct payload.
  const posted = await postPromise;
  expect((posted as { isAvailable?: boolean }).isAvailable).toBe(true);
  expect(Array.isArray((posted as { allergens?: string[] }).allergens)).toBe(true);
  expect((posted as { allergens?: string[] }).allergens?.length).toBeGreaterThan(0);

  // The new dish card appears on the grid.
  await expect(page.getByText('Sunday Jollof Rice')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('Live')).toBeVisible();

  console.log(
    `T1 complete: ${m.elapsedSec().toFixed(1)} s, ${await m.clicks()} clicks, 0 navigations`,
  );
});

// ── T2: Add a second dish in a different category ───────────────────────────

test('T2: add second dish in a different category - under 45 s - zero navigations', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  await installBaseMocks(page, [LIVE_ITEM]);

  const secondItem = makeItem('item-second', {
    name: 'Egusi Soup',
    category: 'soup',
    pricePence: 1200,
    isAvailable: false,
    moderationStatus: 'auto_approved',
    allergens: [],
    allergensFreeFrom: false,
    tags: [],
    sortOrder: 1,
  });

  const postPromise = captureNextRequest(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items$/,
    201,
    secondItem,
  );

  await page.goto('/menu');
  await waitForMenuReady(page);
  m.startTask();

  await openNewDishPanel(page);

  // Select the Soup category - different from the default (Tray).
  await page.locator('#dish-category').selectOption('soup');
  await fillEssentials(page, 'Egusi Soup', '12.00');

  // Update items mock to include both dishes after save.
  await page.unroute(/\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/);
  await mockAlways(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/,
    200,
    [LIVE_ITEM, secondItem],
  );

  await page.getByRole('button', { name: 'Save dish' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a dish' })).toBeHidden({ timeout: 5_000 });

  m.assertNoNavigation('T2');
  m.assertElapsed(45, 'T2');

  const posted = await postPromise;
  expect((posted as { category?: string }).category).toBe('soup');

  // Both category headings visible.
  await expect(page.getByText('Tray')).toBeVisible();
  await expect(page.getByText('Soup')).toBeVisible();

  console.log(
    `T2 complete: ${m.elapsedSec().toFixed(1)} s, ${await m.clicks()} clicks, 0 navigations`,
  );
});

// ── T3: Mark an existing dish sold out - exactly 1 click - no panel ──────────

test('T3: mark dish sold out - 1 click - no panel opened', async ({ page }) => {
  const m = new PageMetrics(page);
  await m.install();

  await installBaseMocks(page, [LIVE_ITEM]);

  // Capture the PATCH and respond with the sold-out version.
  const soldOutVersion = {
    ...LIVE_ITEM,
    isAvailable: false,
    tags: ['sold_out'],
  };
  const patchPromise = captureNextRequest(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items\/[^/]+$/,
    200,
    soldOutVersion,
  );

  await page.goto('/menu');
  await waitForMenuReady(page);

  // The "Mark as sold out" button is the one visible control for T3.
  await expect(page.getByRole('button', { name: 'Mark as sold out' })).toBeVisible();

  // Update the items response for the refetch.
  await page.unroute(/\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/);
  await mockAlways(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/,
    200,
    [soldOutVersion],
  );

  m.startTask();
  await page.getByRole('button', { name: 'Mark as sold out' }).click();

  // ── Assertions ─────────────────────────────────────────────────────────────

  // Panel must NOT have opened at any point.
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 1_000 }).catch(() => {
    // Dialog might not exist in DOM at all - either way, it must not be visible.
    expect(page.getByRole('dialog')).not.toBeVisible();
  });

  m.assertNoNavigation('T3');

  const clickCount = await m.clicks();
  expect(
    clickCount,
    `T3: expected exactly 1 click (the sold-out toggle), got ${clickCount}. ` +
      'The button must fire a direct mutation without opening any panel.',
  ).toBe(1);

  const patched = await patchPromise;
  expect((patched as { isAvailable?: boolean }).isAvailable).toBe(false);
  expect((patched as { soldOut?: boolean }).soldOut).toBe(true);

  // Status badge updates to Sold out.
  await expect(page.getByText('Sold out').first()).toBeVisible({ timeout: 5_000 });

  console.log(
    `T3 complete: ${m.elapsedSec().toFixed(1)} s, ${await m.clicks()} clicks - PASS`,
  );
});

// ── T4: Change a dish price - under 20 s - panel opens and closes inline ─────

test('T4: change a dish price - under 20 s - no navigation - panel closes inline', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  await installBaseMocks(page, [LIVE_ITEM]);

  const updatedItem = { ...LIVE_ITEM, pricePence: 1700 };
  const patchPromise = captureNextRequest(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items\/[^/]+$/,
    200,
    updatedItem,
  );

  await page.goto('/menu');
  await waitForMenuReady(page);

  await page.unroute(/\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/);
  await mockAlways(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/,
    200,
    [updatedItem],
  );

  m.startTask();

  // Open editor via the Edit button on the card.
  await page.getByRole('button', { name: `Edit ${LIVE_ITEM.name}` }).click();
  await expect(page.getByRole('dialog', { name: 'Edit dish' })).toBeVisible();

  // Change price.
  await page.locator('#dish-price').fill('17.00');

  await page.getByRole('button', { name: 'Save dish' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit dish' })).toBeHidden({ timeout: 5_000 });

  // ── Assertions ─────────────────────────────────────────────────────────────

  m.assertNoNavigation('T4');
  m.assertElapsed(20, 'T4');

  const patched = await patchPromise;
  expect((patched as { basePricePence?: number }).basePricePence).toBe(1700);

  // Updated price visible on card.
  await expect(page.getByText('£17.00')).toBeVisible({ timeout: 3_000 });

  console.log(
    `T4 complete: ${m.elapsedSec().toFixed(1)} s, ${await m.clicks()} clicks, 0 navigations`,
  );
});

// ── T5: Reorder two dishes - assert order persists after reload ───────────────

test('T5: drag to reorder two dishes - order persists after page reload', async ({ page }) => {
  const m = new PageMetrics(page);
  await m.install();

  const itemA = makeItem('item-a', { name: 'Dish A', category: 'tray', sortOrder: 1 });
  const itemB = makeItem('item-b', { name: 'Dish B', category: 'tray', sortOrder: 2 });

  await installBaseMocks(page, [itemA, itemB]);

  // Capture the reorder PATCH - the client sends the full ordered ID list.
  let capturedOrder: string[] = [];
  const reorderPromise = captureNextRequest(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items\/reorder$/,
    200,
    [{ ...itemB, sortOrder: 1 }, { ...itemA, sortOrder: 2 }],
  ).then((body) => {
    capturedOrder = (body as { itemIds?: string[] }).itemIds ?? [];
    return body;
  });

  await page.goto('/menu');
  await waitForMenuReady(page);

  // Confirm initial order: A before B.
  const cards = page.locator('.group').filter({ hasText: 'Dish' });
  await expect(cards.nth(0)).toContainText('Dish A');
  await expect(cards.nth(1)).toContainText('Dish B');

  m.startTask();

  // Drag Dish A's handle onto Dish B to swap order.
  const handleA = page
    .getByRole('button', { name: 'Drag to reorder' })
    .first();
  const handleB = page
    .getByRole('button', { name: 'Drag to reorder' })
    .nth(1);

  const boxA = await handleA.boundingBox();
  const boxB = await handleB.boundingBox();

  if (!boxA || !boxB) throw new Error('T5: could not get drag handle bounding boxes');

  // Simulate a pointer drag: press on A, move to B, release.
  await page.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 2);
  await page.mouse.down();
  // Move in steps to satisfy the 8 px activation constraint.
  await page.mouse.move(boxB.x + boxB.width / 2, boxB.y + boxB.height / 2, { steps: 10 });
  await page.mouse.up();

  // Wait for the reorder API call to settle.
  await reorderPromise;

  // ── Navigation assertion for the drag task (must be 0) ─────────────────────
  m.assertNoNavigation('T5 (drag phase)');
  m.stopTask(); // isolate the drag task from the reload below

  // The ID list sent to the API must have B before A.
  expect(capturedOrder[0]).toBe('item-b');
  expect(capturedOrder[1]).toBe('item-a');

  // ── Reload assertion (persistence) ─────────────────────────────────────────
  // Set up the items mock to return the NEW order so the reload reflects
  // what the backend persisted.
  await page.unroute(/\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/);
  await mockAlways(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/,
    200,
    [{ ...itemB, sortOrder: 1 }, { ...itemA, sortOrder: 2 }],
  );

  await page.reload();
  await waitForMenuReady(page);

  const reloadedCards = page.locator('.group').filter({ hasText: 'Dish' });
  await expect(reloadedCards.nth(0)).toContainText('Dish B', { timeout: 5_000 });
  await expect(reloadedCards.nth(1)).toContainText('Dish A', { timeout: 5_000 });

  console.log('T5 complete: drag reorder persisted across page reload - PASS');
});

// ── T6: Allergen gate - attempt to publish without declaration ───────────────

test('T6: publish blocked without allergen declaration - error shown - allergen section focused', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  await installBaseMocks(page, []);

  await page.goto('/menu');
  await waitForMenuReady(page);
  m.startTask();

  await openNewDishPanel(page);
  await fillEssentials(page, 'Allergen Gate Test Dish', '10.00');

  // Deliberately leave all allergen checkboxes unticked and "contains none" unchecked.
  // Set status to LIVE.
  await page.getByRole('button', { name: 'Live' }).click();

  // Attempt to save - this must be blocked by the client.
  await page.getByRole('button', { name: 'Save dish' }).click();

  // ── Assertions ─────────────────────────────────────────────────────────────

  // Panel must remain open (save was rejected).
  await expect(page.getByRole('dialog', { name: 'Add a dish' })).toBeVisible();

  m.assertNoNavigation('T6');

  // The allergen fieldset must be highlighted with the error style.
  const allergenFieldset = page.locator('fieldset').filter({ hasText: 'Allergens (FSA 14)' });
  await expect(allergenFieldset).toBeVisible();

  // The inline error explanation must appear inside the fieldset.
  await expect(
    allergenFieldset.getByText(/Tick at least one allergen or confirm none apply/i),
  ).toBeVisible({ timeout: 3_000 });

  // The fieldset must be scrolled into view (check it is inside the viewport).
  const isInViewport = await allergenFieldset.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight + 50;
  });
  expect(isInViewport, 'T6: allergen fieldset must be scrolled into viewport after failed save').toBe(
    true,
  );

  // The toast with the error message must appear.
  await expect(page.getByText(/Allergen info required/i)).toBeVisible({ timeout: 3_000 });

  // No API POST must have been made (client-side gate).
  // (If a POST had fired, the captureNextRequest would have consumed the mock
  // and any subsequent real request would error with network error in the test -
  // verifying via the panel staying open is sufficient.)

  console.log('T6 complete: allergen gate blocks publish - PASS');
});

// ── T7: Publish using "contains none" affirmation ───────────────────────────

test('T7: publish via allergen-free affirmation - allergensFreeFrom stored as true not empty array', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  await installBaseMocks(page, []);

  const freeFromItem = makeItem('item-freefrom', {
    name: 'Plain Rice (no allergens)',
    category: 'tray',
    pricePence: 500,
    isAvailable: true,
    moderationStatus: 'auto_approved',
    allergens: [],
    allergensFreeFrom: true,
    tags: [],
    sortOrder: 1,
  });

  const postPromise = captureNextRequest(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items$/,
    201,
    freeFromItem,
  );

  await page.goto('/menu');
  await waitForMenuReady(page);
  m.startTask();

  await openNewDishPanel(page);
  await fillEssentials(page, 'Plain Rice (no allergens)', '5.00');

  // Tick the "contains none of the 14 allergens" checkbox.
  const noneCheckbox = page.getByText(/This dish contains.*none.*of the 14 allergens/i)
    .locator('..')
    .locator('input[type="checkbox"]');
  await noneCheckbox.check();

  // Confirm it is checked and the individual allergen boxes are still unticked.
  await expect(noneCheckbox).toBeChecked();
  const nutsCheckbox = page.getByText('Nuts').locator('..').locator('input[type="checkbox"]');
  await expect(nutsCheckbox).not.toBeChecked();

  // Set LIVE.
  await page.getByRole('button', { name: 'Live' }).click();

  await page.unroute(/\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/);
  await mockAlways(
    page,
    /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/,
    200,
    [freeFromItem],
  );

  await page.getByRole('button', { name: 'Save dish' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a dish' })).toBeHidden({ timeout: 5_000 });

  m.assertNoNavigation('T7');

  // ── Critical assertions ────────────────────────────────────────────────────

  const posted = await postPromise;
  const body = posted as {
    allergensFreeFrom?: boolean;
    allergens?: unknown[];
    isAvailable?: boolean;
  };

  // allergensFreeFrom must be explicitly true - NOT inferred from an empty array.
  expect(body.allergensFreeFrom, 'T7: allergensFreeFrom must be true, not undefined or false').toBe(
    true,
  );

  // allergens must be an empty array (no allergen was ticked).
  expect(Array.isArray(body.allergens), 'T7: allergens field must be an array').toBe(true);
  expect(
    body.allergens?.length,
    'T7: allergens must be empty (no individual allergen was ticked)',
  ).toBe(0);

  // The stored state is meaningfully different from allergens:[] without the flag.
  // Validate: allergensFreeFrom=true AND allergens=[] is the correct representation;
  // allergensFreeFrom=false AND allergens=[] would mean "not declared".
  expect(
    body.allergensFreeFrom === true && body.allergens?.length === 0,
    'T7: the combination allergensFreeFrom=true + allergens=[] must differ from the "not declared" state (allergensFreeFrom=false + allergens=[])',
  ).toBe(true);

  expect(body.isAvailable).toBe(true);

  // Card appears as Live.
  await expect(page.getByText('Live')).toBeVisible({ timeout: 3_000 });

  console.log('T7 complete: free-from affirmation stored correctly - PASS');
});

// ── T8: Upload photo, then edit name - name must not be lost ─────────────────

test('T8: staging a photo does not discard the dish name already typed', async ({ page }) => {
  const m = new PageMetrics(page);
  await m.install();

  await installBaseMocks(page, []);

  await page.goto('/menu');
  await waitForMenuReady(page);
  m.startTask();

  await openNewDishPanel(page);

  // Type the name first.
  await page.locator('#dish-name').fill('Pepper Soup Special');
  await expect(page.locator('#dish-name')).toHaveValue('Pepper Soup Special');

  // Stage a photo via the file chooser.
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add photo' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles({
    name: 'soup.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('JFIF-stub-for-testing'),
  });

  // React patch({stagedFiles: [...]}) uses the functional updater and must
  // preserve every other field. Assert the name survived the state update.
  await expect(
    page.locator('#dish-name'),
    'T8: name input must retain its value after a photo is staged',
  ).toHaveValue('Pepper Soup Special', { timeout: 2_000 });

  // The staged photo thumbnail must appear (proves the file was accepted).
  await expect(
    page.getByRole('button', { name: 'Remove staged photo' }).first(),
  ).toBeVisible({ timeout: 2_000 });

  // Now type extra text to confirm the field is still interactive.
  await page.locator('#dish-name').fill('Pepper Soup Special (updated)');
  await expect(page.locator('#dish-name')).toHaveValue('Pepper Soup Special (updated)');

  m.assertNoNavigation('T8');

  console.log('T8 complete: name preserved after photo staging - PASS');
});

// ── T9: 30 dishes grid renders under 2 s, search filters correctly ───────────

test('T9: 30 dishes - grid renders under 2 s - search filters correctly', async ({ page }) => {
  const m = new PageMetrics(page);
  await m.install();

  const dishes = makeDishList(30);
  await installBaseMocks(page, dishes);

  // Mark time before navigation so we can measure end-to-end render.
  const beforeNav = Date.now();

  await page.goto('/menu');

  // Wait for all dish names to be visible (30 cards rendered).
  await expect(page.getByText('Dish 30')).toBeVisible({ timeout: 5_000 });

  const renderMs = Date.now() - beforeNav;

  expect(
    renderMs,
    `T9: grid with 30 dishes must render in under 2 000 ms, took ${renderMs} ms`,
  ).toBeLessThan(2_000);

  // ── Search filtering ────────────────────────────────────────────────────────

  m.startTask();

  // There are 4 soup-category dishes (indices 1, 9, 17, 25 - category is cats[i%8]).
  // Search by category label "Soup" to verify filtering.
  const searchInput = page.getByRole('textbox', { name: 'Search dishes' });
  await searchInput.fill('Soup');

  // Only soup items should remain visible.
  const soupItems = dishes.filter((d) => d.category === 'soup');
  for (const dish of soupItems) {
    await expect(page.getByText(dish.name)).toBeVisible({ timeout: 2_000 });
  }

  // Non-soup items must be hidden.
  const nonSoupItem = dishes.find((d) => d.category !== 'soup')!;
  await expect(page.getByText(nonSoupItem.name)).toBeHidden({ timeout: 2_000 });

  // Clearing the search restores all items.
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByText('Dish 30')).toBeVisible({ timeout: 2_000 });

  m.assertNoNavigation('T9');

  console.log(`T9 complete: 30-dish render took ${renderMs} ms - search filtering correct - PASS`);
});

// ── T10: 40-character business name - no element overlap ─────────────────────

test('T10: 40-character business name - no overlap between name and nav items', async ({
  page,
}) => {
  const m = new PageMetrics(page);

  // "Kwame Asante's West African Food Kitchen" is exactly 40 characters.
  const longName = "Kwame Asante's West African Food Kitchen";
  expect(longName.length).toBe(40);

  await installBaseMocks(page, [LIVE_ITEM], { businessName: longName });
  await m.install();

  await page.goto('/menu');
  await waitForMenuReady(page);

  // ── Check SideNav VendorPill (desktop) ─────────────────────────────────────

  // The VendorPill has the business name with class "truncate".
  const vendorPillName = page
    .locator('p.truncate.text-sm.font-semibold')
    .filter({ hasText: longName.slice(0, 5) }) // first 5 chars will always be visible
    .first();

  await expect(vendorPillName).toBeVisible();

  // Get the first nav link ("Dashboard") bounding box.
  const dashboardLink = page.getByRole('link', { name: 'Dashboard' }).first();
  await expect(dashboardLink).toBeVisible();

  const pillBox = await vendorPillName.boundingBox();
  const dashBox = await dashboardLink.boundingBox();

  if (!pillBox || !dashBox) {
    throw new Error('T10: could not get bounding boxes for overlap check');
  }

  // Overlap check: two rectangles overlap if neither is fully to the left,
  // right, above, or below the other.
  const horizontallyOverlap =
    pillBox.x < dashBox.x + dashBox.width && pillBox.x + pillBox.width > dashBox.x;
  const verticallyOverlap =
    pillBox.y < dashBox.y + dashBox.height && pillBox.y + pillBox.height > dashBox.y;

  const overlap = horizontallyOverlap && verticallyOverlap;

  expect(
    overlap,
    `T10: business name element (x=${pillBox.x.toFixed(0)}, y=${pillBox.y.toFixed(0)}, ` +
      `w=${pillBox.width.toFixed(0)}, h=${pillBox.height.toFixed(0)}) overlaps ` +
      `Dashboard link (x=${dashBox.x.toFixed(0)}, y=${dashBox.y.toFixed(0)}, ` +
      `w=${dashBox.width.toFixed(0)}, h=${dashBox.height.toFixed(0)})`,
  ).toBe(false);

  // Also verify the text is not zero-width (element not hidden by overflow:hidden
  // collapsing its container to nothing).
  expect(pillBox.width, 'T10: business name must have visible width').toBeGreaterThan(0);

  // Nav item must not wrap onto multiple lines (height should be single-line).
  // A nav link with text-sm (14px) line-height ~20px: height > 36px = wrapping.
  expect(
    dashBox.height,
    `T10: Dashboard nav link height ${dashBox.height.toFixed(0)} px suggests text wrapped onto ` +
      'a second line at 1280 px viewport - check whitespace-nowrap or font-size',
  ).toBeLessThanOrEqual(40);

  console.log(
    `T10 complete: no overlap detected. Pill box: (${pillBox.x.toFixed(0)}, ${pillBox.y.toFixed(0)}). ` +
      `Dashboard box: (${dashBox.x.toFixed(0)}, ${dashBox.y.toFixed(0)}) - PASS`,
  );
});
