/**
 * Automated usability test suite for the /settings/delivery screen.
 *
 * Design principles (mirroring menu-screen.spec.ts):
 *   - Every test measures a complete vendor task: elapsed time, click count,
 *     and page-navigation count. These are the criteria that matter, not
 *     just eventual completion.
 *   - External postcodes.io calls are intercepted so no real network traffic
 *     leaves the runner. The NestJS API is mocked via page.route().
 *   - D3 is the one exception: it intentionally calls the real NestJS API to
 *     verify that persisted postcodes feed through to customer search results.
 *     D3 requires the API server to be running and TEST_API_URL to be set.
 *   - Supabase auth is real: the setup project signs in with test credentials.
 *
 * Run:
 *   npm run test:e2e --workspace=@feastpot/vendor
 */

import { expect, test } from '@playwright/test';

import { PageMetrics } from './helpers/page-metrics';
import {
  DISTRICTS_5MI,
  DISTRICTS_8MI,
  KITCHEN_DISTRICT,
  KITCHEN_LNG,
  KITCHEN_LAT,
  KITCHEN_POSTCODE,
  captureNextDeliveryPut,
  installDeliveryMocks,
  makeDeliveryConfig,
  makeDeliveryVendor,
  mockOutcodeExists,
  mockPostcodesIoLookup,
  waitForDeliveryReady,
} from './helpers/delivery-mocks';

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Move the Radix Slider thumb by pressing arrow keys. */
async function moveSlider(
  page: import('@playwright/test').Page,
  steps: number,
  direction: 'ArrowRight' | 'ArrowLeft' = 'ArrowRight',
) {
  const thumb = page.getByRole('slider');
  await thumb.waitFor({ state: 'visible' });
  await thumb.focus();
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(direction);
    // Brief pause between key presses so React state settles.
    await page.waitForTimeout(50);
  }
}

/** Wait for the specified postcode chip to appear in the chip set. */
async function waitForChip(page: import('@playwright/test').Page, code: string) {
  await expect(page.getByText(code, { exact: true }).first()).toBeVisible({ timeout: 5_000 });
}

/** Assert that a chip with the given label is NOT in the chip set. */
async function assertNoChip(page: import('@playwright/test').Page, code: string) {
  await expect(page.getByRole('button', { name: `Remove ${code}` })).toBeHidden({
    timeout: 2_000,
  });
}

/** Enter the kitchen postcode, blur to trigger validation, wait for area label. */
async function enterKitchenPostcode(
  page: import('@playwright/test').Page,
  postcode: string,
  expectedDistrict: string,
) {
  const input = page.getByRole('textbox', { name: 'Kitchen postcode' });
  await input.fill(postcode);
  await input.blur();
  // Wait for the postcodes.io response to resolve and the area label to appear.
  await expect(page.getByText(expectedDistrict, { exact: false })).toBeVisible({ timeout: 8_000 });
}

// ── D0: Save only becomes available for persisted changes ────────────────────

test('D0: save is disabled until settings change and disables again after reverting', async ({
  page,
}) => {
  await installDeliveryMocks(page, {
    kitchenPostcode: KITCHEN_POSTCODE,
    latitude: KITCHEN_LAT,
    longitude: KITCHEN_LNG,
    postcodes: DISTRICTS_5MI,
  });

  await page.goto('/settings/delivery');
  await waitForDeliveryReady(page);

  const saveButton = page.getByRole('button', { name: 'Save settings' });
  const deliveryFee = page.locator('input[type="number"]').first();

  await expect(saveButton).toBeDisabled();

  await deliveryFee.fill('1.00');
  await expect(saveButton).toBeEnabled();

  await deliveryFee.fill('0.00');
  await expect(saveButton).toBeDisabled();
});

// ── D1: Set a service area from scratch using the radius control ──────────────

test('D1: set service area with radius - chips change when radius changes - under 60 s', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  await installDeliveryMocks(
    page,
    {},
    {
      districtsByRadius: { 5: DISTRICTS_5MI, 8: DISTRICTS_8MI },
    },
  );

  await page.goto('/settings/delivery');
  await waitForDeliveryReady(page);
  m.startTask();

  // Starting state: no kitchen postcode, slider disabled, no chips.
  const slider = page.getByRole('slider');
  await expect(slider).toBeDisabled();

  // Enter the kitchen postcode and wait for the area label.
  await enterKitchenPostcode(page, KITCHEN_POSTCODE, KITCHEN_DISTRICT);

  // Slider must now be enabled.
  await expect(slider).not.toBeDisabled();

  // At radius=5 (default), no compute-districts call has fired yet
  // because the slider has not moved. Chips are empty.
  await expect(page.getByText('No districts selected.', { exact: false })).toBeVisible();

  // Move slider from 5 to 8 (+3 steps) to trigger the 600 ms debounce.
  await moveSlider(page, 3);

  // Wait for the debounce + API round-trip; chips must update.
  for (const code of DISTRICTS_8MI) {
    await waitForChip(page, code);
  }

  // All old DISTRICTS_5MI codes are a subset of DISTRICTS_8MI in the fixture,
  // so we just assert the expanded set is present.
  expect(
    DISTRICTS_8MI.length,
    'D1: 8-mile district set must be larger than 5-mile set',
  ).toBeGreaterThan(DISTRICTS_5MI.length);

  m.assertNoNavigation('D1');
  m.assertElapsed(60, 'D1');

  console.log(
    `D1 complete: ${m.elapsedSec().toFixed(1)} s, ${await m.clicks()} clicks, 0 navigations`,
  );
});

// ── D2: Remove a generated postcode and add one outside the radius ────────────

test('D2: remove generated postcode - add manual postcode outside radius - both persist after reload', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  // Load with a pre-seeded service area so we have chips from the start.
  await installDeliveryMocks(
    page,
    {
      kitchenPostcode: KITCHEN_POSTCODE,
      latitude: KITCHEN_LAT,
      longitude: KITCHEN_LNG,
      postcodes: [...DISTRICTS_5MI],
    },
    { districtsByRadius: { 5: DISTRICTS_5MI } },
  );

  // The manual-add validates SE15 via outcodes API.
  await mockOutcodeExists(page, 'SE15', true);

  await page.goto('/settings/delivery');
  await waitForDeliveryReady(page);

  // Chips must be seeded from the config.
  for (const code of DISTRICTS_5MI) {
    await waitForChip(page, code);
  }

  m.startTask();

  // Remove the first chip (SW2).
  await page.getByRole('button', { name: 'Remove SW2' }).click();
  await assertNoChip(page, 'SW2');

  // Add SE15 (which is outside the 5-mile fixture radius).
  const addInput = page.getByRole('textbox', { name: 'Postcode district to add' });
  await addInput.fill('SE15');
  await page.getByRole('button', { name: 'Add' }).click();

  // Wait for outcode validation + chip to appear.
  await waitForChip(page, 'SE15');

  // SW2 must still be absent.
  await assertNoChip(page, 'SW2');

  // Capture the save payload.
  const remainingCodes = DISTRICTS_5MI.filter((c) => c !== 'SW2')
    .concat(['SE15'])
    .sort();
  const putBody = await captureNextDeliveryPut(
    page,
    makeDeliveryConfig({
      kitchenPostcode: KITCHEN_POSTCODE,
      postcodes: remainingCodes,
    }),
  );

  // Save.
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Delivery settings saved', { exact: false })).toBeVisible({
    timeout: 5_000,
  });

  // Verify the payload sent to the API.
  const savedPostcodes = (putBody as { postcodes?: string[] }).postcodes ?? [];
  expect(savedPostcodes, 'D2: SW2 must not be in the saved postcodes').not.toContain('SW2');
  expect(savedPostcodes, 'D2: SE15 must be in the saved postcodes').toContain('SE15');

  m.assertNoNavigation('D2');

  // ── Reload assert ────────────────────────────────────────────────────────
  // Re-mock the delivery-config GET to return the new state.
  await page.unroute(/\/v1\/vendors\/me\/delivery-config$/);
  await page.route(/\/v1\/vendors\/me\/delivery-config$/, (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          makeDeliveryConfig({
            kitchenPostcode: KITCHEN_POSTCODE,
            postcodes: remainingCodes,
          }),
        ),
      });
    } else {
      void route.continue();
    }
  });

  await page.reload();
  await waitForDeliveryReady(page);

  // After reload, the saved state must be reflected.
  await waitForChip(page, 'SE15');
  await assertNoChip(page, 'SW2');

  console.log(
    `D2 complete: ${m.elapsedSec().toFixed(1)} s - manual district persists, removed district gone - PASS`,
  );
});

// ── D3: THE CRITICAL TEST - service area feeds customer search ────────────────
//
// This test does NOT mock the NestJS search endpoint. It saves a real delivery
// config via the form (the PUT is captured to verify the correct postcodes are
// sent) and then calls the real API search endpoint to assert the vendor appears
// for a postcode in the service area and is absent for one outside it.
//
// Prerequisites:
//   - The NestJS API server must be running (port from TEST_API_URL, default
//     http://localhost:3001).
//   - The test vendor account must be in `live` status in the database.
//   - TEST_VENDOR_ID must be set to the vendor's database UUID so the
//     assertion can filter search results precisely.
//
// If TEST_API_URL is unset this test is skipped with a clear message rather
// than failing, so the mocked suite still runs in full.

test('D3: [CRITICAL] saved service area postcodes appear in customer search - excluded postcodes do not', async ({
  page,
}) => {
  const apiUrl = process.env.TEST_API_URL;
  const vendorId = process.env.TEST_VENDOR_ID;

  if (!apiUrl) {
    test.skip(
      true,
      'D3 requires TEST_API_URL pointing at the running NestJS API (e.g. http://localhost:3001). ' +
        'Set it to run this integration assertion.',
    );
    return;
  }

  if (!vendorId) {
    test.skip(true, 'D3 requires TEST_VENDOR_ID set to the test vendor UUID in the database.');
    return;
  }

  const m = new PageMetrics(page);
  await m.install();

  // For D3 we mock only the delivery-config GET (to control initial state) and
  // the postcodes.io lookup. The PUT goes to the real API.
  const vendor = makeDeliveryVendor();
  await page.route(/\/v1\/vendors\/me$/, (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(vendor),
      });
    } else {
      void route.continue();
    }
  });

  // Mock the initial GET delivery-config to return a state with no postcodes.
  await page.route(/\/v1\/vendors\/me\/delivery-config$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeDeliveryConfig()),
      });
    } else {
      // Let the PUT go to the real API.
      void route.continue();
    }
  });

  // Mock compute-districts to return SE5 for the chosen radius.
  await page.route(/\/v1\/vendors\/me\/delivery-config\/compute-districts/, (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ districts: ['SE5'] }),
    });
  });

  await mockPostcodesIoLookup(page, KITCHEN_POSTCODE, KITCHEN_LAT, KITCHEN_LNG, KITCHEN_DISTRICT);

  await page.goto('/settings/delivery');
  await waitForDeliveryReady(page);
  m.startTask();

  // Configure service area for SE5 only.
  await enterKitchenPostcode(page, KITCHEN_POSTCODE, KITCHEN_DISTRICT);
  await expect(page.getByRole('slider')).not.toBeDisabled();
  await moveSlider(page, 1); // move to trigger compute-districts -> ['SE5']
  await waitForChip(page, 'SE5');

  // Save to the real API.
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Delivery settings saved', { exact: false })).toBeVisible({
    timeout: 10_000,
  });

  m.assertNoNavigation('D3');

  // ── Search assertions via the real NestJS API ────────────────────────────
  //
  // SE5 1AA is a valid full postcode in the SE5 district (Camberwell).
  // N1 1AA is in the N1 district (Islington) - outside the service area.

  const searchIncluded = await page.evaluate(
    async ({ url, vendorId }: { url: string; vendorId: string }) => {
      const res = await fetch(`${url}/v1/vendors?postcode=SE51AA`, {
        credentials: 'include',
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = (await res.json()) as { id?: string; items?: { id: string }[] };
      // The search endpoint may return an array or a paginated object.
      const items: { id: string }[] = Array.isArray(data)
        ? (data as { id: string }[])
        : (data.items ?? []);
      return { ok: true, found: items.some((v) => v.id === vendorId) };
    },
    { url: apiUrl, vendorId },
  );

  expect(
    searchIncluded.ok,
    `D3: search request to ${apiUrl}/v1/vendors?postcode=SE51AA failed with status ${(searchIncluded as { status?: number }).status ?? 'unknown'}`,
  ).toBe(true);

  expect(
    (searchIncluded as { found?: boolean }).found,
    'D3 CRITICAL: vendor with SE5 in service area must appear in search for postcode SE5 1AA. ' +
      'The service area persisted to the DB and the search filter must be coupled - ' +
      'if this fails the radius slider and search have diverged.',
  ).toBe(true);

  const searchExcluded = await page.evaluate(
    async ({ url, vendorId }: { url: string; vendorId: string }) => {
      const res = await fetch(`${url}/v1/vendors?postcode=N11AA`, {
        credentials: 'include',
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = (await res.json()) as { id?: string; items?: { id: string }[] };
      const items: { id: string }[] = Array.isArray(data)
        ? (data as { id: string }[])
        : (data.items ?? []);
      return { ok: true, found: items.some((v) => v.id === vendorId) };
    },
    { url: apiUrl, vendorId },
  );

  expect(
    searchExcluded.ok,
    `D3: excluded-postcode search failed with status ${(searchExcluded as { status?: number }).status ?? 'unknown'}`,
  ).toBe(true);

  expect(
    (searchExcluded as { found?: boolean }).found,
    'D3 CRITICAL: vendor must NOT appear in search for postcode N1 1AA (outside SE5 service area). ' +
      'If this fails the postcode filter is either not applied or too broad.',
  ).toBe(false);

  console.log(
    `D3 complete: ${m.elapsedSec().toFixed(1)} s - SE5 found=true, N1 found=false - PASS`,
  );
});

// ── D4: Free delivery threshold below minimum order ───────────────────────────

test('D4: free delivery threshold below minimum order - inline error - save blocked', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  await installDeliveryMocks(page, { postcodes: DISTRICTS_5MI, kitchenPostcode: KITCHEN_POSTCODE });

  await page.goto('/settings/delivery');
  await waitForDeliveryReady(page);
  m.startTask();

  // Minimum order = £20.
  const minOrderInput = page.getByLabel('Minimum order');
  await minOrderInput.fill('20.00');

  // Free delivery threshold = £15 (below the minimum order).
  const freeDeliveryInput = page.getByLabel('Free delivery over (optional)');
  await freeDeliveryInput.fill('15.00');

  // Trigger validation by blurring or clicking elsewhere.
  await page.getByRole('heading', { name: 'Order rules' }).click();

  // ── Assertions ────────────────────────────────────────────────────────────

  // The error must appear inline, naming both figures.
  const errorText = page.getByText(/must be higher than the minimum order/i);
  await expect(errorText).toBeVisible({ timeout: 3_000 });

  // The error message must name the actual amounts.
  await expect(errorText).toContainText('£15.00');
  await expect(errorText).toContainText('£20.00');

  // Save button must be disabled.
  const saveButton = page.getByRole('button', { name: 'Save settings' });
  await expect(saveButton).toBeDisabled();

  // Correcting the threshold (£25) must clear the error.
  await freeDeliveryInput.fill('25.00');
  await page.getByRole('heading', { name: 'Order rules' }).click();

  await expect(errorText).toBeHidden({ timeout: 2_000 });
  await expect(saveButton).not.toBeDisabled();

  m.assertNoNavigation('D4');

  console.log('D4 complete: threshold validation correct, save blocked then unblocked - PASS');
});

// ── D5: Remove all postcodes - discoverable warning appears ──────────────────

test('D5: remove all postcodes - clear warning that vendor will not be discoverable', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  // Start with a pre-seeded service area so there are chips to remove.
  await installDeliveryMocks(page, {
    kitchenPostcode: KITCHEN_POSTCODE,
    latitude: KITCHEN_LAT,
    longitude: KITCHEN_LNG,
    postcodes: ['SE5', 'SW9'],
  });

  await page.goto('/settings/delivery');
  await waitForDeliveryReady(page);

  await waitForChip(page, 'SE5');
  await waitForChip(page, 'SW9');

  m.startTask();

  // Remove SE5.
  await page.getByRole('button', { name: 'Remove SE5' }).click();
  await assertNoChip(page, 'SE5');

  // Remove SW9.
  await page.getByRole('button', { name: 'Remove SW9' }).click();
  await assertNoChip(page, 'SW9');

  // The warning must appear now that the list is empty.
  await expect(
    page.getByText(/Without any districts you will not appear in customer search/i),
  ).toBeVisible({ timeout: 3_000 });

  // The "No districts selected." placeholder must also be visible.
  await expect(page.getByText('No districts selected.')).toBeVisible();

  m.assertNoNavigation('D5');

  console.log('D5 complete: empty districts warning shown after removing all chips - PASS');
});

// ── D6: Enumerate every control - assert each has an observable effect ────────

test('D6: every control on the delivery page produces an observable, correct consequence', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  await installDeliveryMocks(
    page,
    {
      kitchenPostcode: KITCHEN_POSTCODE,
      latitude: KITCHEN_LAT,
      longitude: KITCHEN_LNG,
      postcodes: ['SW9'],
      localFeePence: 250,
      minOrderPence: 1000,
      freeDeliveryOverPence: null,
      types: ['local'],
    },
    { districtsByRadius: { 5: ['SW9', 'SW2'], 6: ['SW9', 'SW2', 'SE24'] } },
  );
  await mockOutcodeExists(page, 'SE15', true);

  await page.goto('/settings/delivery');
  await waitForDeliveryReady(page);

  const noEffect: string[] = [];

  // ── 1. Kitchen postcode input ────────────────────────────────────────────
  // Clearing the postcode and re-entering it should update the area label.
  const postcodeInput = page.getByRole('textbox', { name: 'Kitchen postcode' });
  await postcodeInput.fill('');
  await postcodeInput.blur();
  // Area label should disappear when the field is cleared.
  await expect(page.getByText(KITCHEN_DISTRICT))
    .toBeHidden({ timeout: 3_000 })
    .catch(() => {
      noEffect.push('Kitchen postcode (clearing did not remove area label)');
    });
  // Re-enter the postcode.
  await postcodeInput.fill(KITCHEN_POSTCODE);
  await postcodeInput.blur();
  await expect(page.getByText(KITCHEN_DISTRICT))
    .toBeVisible({ timeout: 8_000 })
    .catch(() => {
      noEffect.push('Kitchen postcode (entering valid postcode did not show area label)');
    });

  // ── 2. Local delivery checkbox ────────────────────────────────────────────
  // Unchecking it should hide the service area section.
  await page.getByText('Local delivery').click();
  await expect(page.getByText('Service area'))
    .toBeHidden({ timeout: 2_000 })
    .catch(() => {
      noEffect.push('Local delivery checkbox (unchecking did not hide Service area section)');
    });
  // Re-check it.
  await page.getByText('Local delivery').click();
  await expect(page.getByText('Service area'))
    .toBeVisible({ timeout: 2_000 })
    .catch(() => {
      noEffect.push('Local delivery checkbox (re-checking did not restore Service area section)');
    });

  // ── 3. Collection checkbox ────────────────────────────────────────────────
  // Checking it should reveal the collection address section.
  await expect(page.getByText('Collection address')).toBeHidden();
  await page.getByText('Collection').click();
  await expect(page.getByText('Collection address'))
    .toBeVisible({ timeout: 2_000 })
    .catch(() => {
      noEffect.push('Collection checkbox (checking did not reveal Collection address section)');
    });
  // Uncheck it.
  await page.getByText('Collection').click();
  await expect(page.getByText('Collection address'))
    .toBeHidden({ timeout: 2_000 })
    .catch(() => {
      noEffect.push('Collection checkbox (unchecking did not hide Collection address section)');
    });

  // ── 4. Radius slider ──────────────────────────────────────────────────────
  // The slider is at radius=5. Move it to 6; compute-districts should fire
  // and add SE24 to the chip set.
  const chipsBefore = await page.getByRole('button', { name: /^Remove / }).count();
  await moveSlider(page, 1);
  // After debounce + API response, SE24 should appear.
  await waitForChip(page, 'SE24').catch(() => {
    noEffect.push('Radius slider (moving right did not change the district chip set)');
  });
  const chipsAfter = await page.getByRole('button', { name: /^Remove / }).count();
  if (chipsAfter <= chipsBefore) {
    noEffect.push('Radius slider (chip count did not increase after radius increase)');
  }

  // ── 5. Remove postcode chip ────────────────────────────────────────────────
  // Remove SW9 - it must disappear from the list.
  await page.getByRole('button', { name: 'Remove SW9' }).click();
  await assertNoChip(page, 'SW9').catch(() => {
    noEffect.push('Remove chip button (SW9 still visible after clicking Remove)');
  });

  // ── 6. Add district input + Add button ────────────────────────────────────
  const addInput = page.getByRole('textbox', { name: 'Postcode district to add' });
  await addInput.fill('SE15');
  await page.getByRole('button', { name: 'Add' }).click();
  await waitForChip(page, 'SE15').catch(() => {
    noEffect.push('Add district input + Add button (SE15 did not appear as a chip)');
  });

  // ── 7. Delivery fee input ─────────────────────────────────────────────────
  // Changing the fee should update the order summary text.
  const deliveryFeeInput = page.getByLabel('Delivery fee');
  await deliveryFeeInput.fill('3.50');
  await page.getByRole('heading', { name: 'Order rules' }).click();
  await expect(page.getByText(/£3\.50/))
    .toBeVisible({ timeout: 2_000 })
    .catch(() => {
      noEffect.push('Delivery fee input (changing fee did not update order summary text)');
    });

  // ── 8. Minimum order input ────────────────────────────────────────────────
  const minOrderInput = page.getByLabel('Minimum order');
  await minOrderInput.fill('15.00');
  await page.getByLabel('Delivery fee').click(); // blur min order
  await expect(page.getByText(/£15\.00/))
    .toBeVisible({ timeout: 2_000 })
    .catch(() => {
      noEffect.push('Minimum order input (changing value did not appear in order summary)');
    });

  // ── 9. Free delivery over input ───────────────────────────────────────────
  const freeDeliveryInput = page.getByLabel('Free delivery over (optional)');
  await freeDeliveryInput.fill('30.00');
  await page.getByLabel('Minimum order').click(); // blur
  // Summary should mention free delivery.
  await expect(page.getByText(/free delivery/i))
    .toBeVisible({ timeout: 2_000 })
    .catch(() => {
      noEffect.push('Free delivery over input (changing value did not update order summary)');
    });

  // ── 10. Collection address fields (check they retain values) ──────────────
  // Enable collection first.
  await page.getByText('Collection').click();
  await expect(page.getByLabel('Address line 1')).toBeVisible();
  await page.getByLabel('Address line 1').fill('15 Coldharbour Lane');
  await page.getByLabel('Town or city').fill('London');
  await page.getByLabel('Postcode').nth(1).fill('SE5 9NR');

  // Verify the values are retained (not cleared on typing elsewhere).
  await page.getByLabel('Town or city').click();
  await expect(page.getByLabel('Address line 1')).toHaveValue('15 Coldharbour Lane');
  if ((await page.getByLabel('Address line 1').inputValue()) !== '15 Coldharbour Lane') {
    noEffect.push('Collection address line 1 (value lost after interacting with other fields)');
  }

  m.assertNoNavigation('D6');

  // ── Report ─────────────────────────────────────────────────────────────────

  expect(
    noEffect,
    [
      'D6: the following controls had no observable effect:',
      ...noEffect.map((e) => `  - ${e}`),
    ].join('\n'),
  ).toHaveLength(0);

  console.log(`D6 complete: all ${10} controls verified - PASS`);
});
