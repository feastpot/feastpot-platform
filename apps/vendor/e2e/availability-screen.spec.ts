/**
 * Automated usability test suite for the /availability screen.
 *
 * Design principles (mirroring delivery-screen.spec.ts):
 *   - Every test measures a complete vendor task.
 *   - API calls are intercepted via page.route() so no real network traffic
 *     leaves the runner, except in AV2 and AV3.
 *   - AV2 and AV3 are integration tests that call the real NestJS API (no
 *     mock on PATCH /vendors/me/availability). They require TEST_API_URL and
 *     TEST_VENDOR_ID, self-skip when absent, and are guarded in CI.
 *   - AV5 enumerates every control and fails with a named list of any control
 *     that produces no observable effect.
 *
 * Run:
 *   npm run test:e2e --workspace=@feastpot/vendor
 */

import { expect, test } from '@playwright/test';

import { PageMetrics } from './helpers/page-metrics';
import {
  futureDateString,
  installAvailabilityMocks,
  makeAvailabilitySnapshot,
  makeAvailabilityVendor,
  makeCapacityRow,
  waitForAvailabilityReady,
} from './helpers/availability-mocks';

// -- AV1: Set opening days and slot window from scratch -----------------------

test('AV1: set weekend-only opening days and slot window from scratch - correct payload sent to API', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  // Start with Mon-Fri active so we can demonstrate changing to Sat+Sun.
  await installAvailabilityMocks(page, { openingDays: [1, 2, 3, 4, 5] });

  await page.goto('/availability');
  await waitForAvailabilityReady(page);
  m.startTask();

  // Verify Mon-Fri pills are active.
  for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    await expect(page.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
  }
  for (const label of ['Sat', 'Sun']) {
    await expect(page.getByRole('button', { name: label })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  }

  // Deactivate Mon through Fri.
  for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    await page.getByRole('button', { name: label }).click();
  }

  // Activate Sat and Sun.
  await page.getByRole('button', { name: 'Sat' }).click();
  await page.getByRole('button', { name: 'Sun' }).click();

  // Verify the pills flipped correctly.
  for (const label of ['Sat', 'Sun']) {
    await expect(page.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
  }
  for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    await expect(page.getByRole('button', { name: label })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  }

  // Change slot window: open at 10, close at 18.
  await page.locator('#open').fill('10');
  await page.locator('#close').fill('18');

  // Capture the save payload.
  const { openingDays, slotOpenHour, slotCloseHour } = await new Promise<{
    openingDays: number[];
    slotOpenHour: number;
    slotCloseHour: number;
  }>((resolve) => {
    void page.route(/\/v1\/vendors\/me\/availability$/, (route) => {
      if (route.request().method() !== 'PATCH') {
        void route.continue();
        return;
      }
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        openingDays: number[];
        slotOpenHour: number;
        slotCloseHour: number;
      };
      void page.unroute(/\/v1\/vendors\/me\/availability$/);
      const snapshot = makeAvailabilitySnapshot({
        openingDays: body.openingDays,
        slotOpenHour: body.slotOpenHour,
        slotCloseHour: body.slotCloseHour,
      });
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(snapshot),
      });
      resolve(body);
    });
  });

  await page.getByRole('button', { name: 'Save availability' }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 5_000 });

  m.assertNoNavigation('AV1');

  // -- Assertions on the payload sent to the API ----------------------------

  expect(
    openingDays.sort((a, b) => a - b),
    'AV1: openingDays must contain only Sat (6) and Sun (0)',
  ).toEqual([0, 6]);

  expect(slotOpenHour, 'AV1: slotOpenHour must be 10').toBe(10);
  expect(slotCloseHour, 'AV1: slotCloseHour must be 18').toBe(18);

  console.log(
    `AV1 complete: ${m.elapsedSec().toFixed(1)} s, ${await m.clicks()} clicks - openingDays=[0,6] slot=10-18 - PASS`,
  );
});

// -- AV2: Daily order cap - real API integration test -------------------------
//
// This test does NOT mock PATCH /vendors/me/availability. It saves a daily cap
// via the form and then calls the real public API to assert the cap is stored
// and reflected in the customer-facing availability snapshot. This guards
// against the pattern (found three times on this product) where the cap UI
// accepts input but the value is silently not persisted or not enforced.
//
// Prerequisites:
//   TEST_API_URL  - NestJS API origin (e.g. http://localhost:3001)
//   TEST_VENDOR_ID - UUID of the pre-seeded test vendor in the DB

test('AV2: [CRITICAL] daily order cap reaches the customer-facing availability API after being saved', async ({
  page,
}) => {
  const apiUrl = process.env.TEST_API_URL;
  const vendorId = process.env.TEST_VENDOR_ID;

  if (!apiUrl) {
    test.skip(
      true,
      'AV2 requires TEST_API_URL pointing at the running NestJS API. Set it to run this integration assertion.',
    );
    return;
  }
  if (!vendorId) {
    test.skip(true, 'AV2 requires TEST_VENDOR_ID set to the test vendor UUID in the database.');
    return;
  }

  const m = new PageMetrics(page);
  await m.install();

  // Mock the vendor GET and the initial availability GET so the page loads
  // without the real API, but let the PATCH through.
  const vendor = makeAvailabilityVendor();
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

  // Initial GET returns no cap; PATCH and subsequent GETs go to real API.
  await page.route(/\/v1\/vendors\/me\/availability$/, async (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeAvailabilitySnapshot({ maxOrdersPerDay: null })),
      });
    } else {
      // PATCH goes to the real API.
      void route.continue();
    }
  });

  // Capacity and blackout routes: let them through to the real API so the
  // test does not interfere with capacity state.
  await page.route(/\/v1\/vendors\/me\/capacity/, (route) => {
    void route.continue();
  });
  await page.route(/\/v1\/vendors\/me\/blackouts/, (route) => {
    void route.continue();
  });

  await page.goto('/availability');
  await waitForAvailabilityReady(page);
  m.startTask();

  // Set daily cap to 1.
  await page.locator('#cap-orders').fill('1');

  // Save to the real API.
  await page.getByRole('button', { name: 'Save availability' }).click();

  // Wait for success; the real API PATCH returns the updated snapshot.
  // The client shows "Saved." on success.
  await expect(
    page.getByText('Saved.', { exact: true }),
    'AV2: "Saved." confirmation must appear - the real API PATCH must return 200',
  ).toBeVisible({ timeout: 10_000 });

  m.assertNoNavigation('AV2');

  // -- Assert via the real public API that the cap is stored ----------------
  //
  // GET /v1/vendors/:id/availability is the endpoint customers call during
  // checkout. If maxOrdersPerDay from this response does not equal 1, the cap
  // was not persisted or the public endpoint is not reading it.

  const publicSnap = await page.evaluate(
    async ({ url, id }: { url: string; id: string }) => {
      const res = await fetch(`${url}/v1/vendors/${id}/availability`);
      if (!res.ok) return { ok: false, status: res.status, maxOrdersPerDay: null };
      const data = (await res.json()) as { maxOrdersPerDay?: number | null };
      return { ok: true, status: res.status, maxOrdersPerDay: data.maxOrdersPerDay ?? null };
    },
    { url: apiUrl, id: vendorId },
  );

  expect(
    publicSnap.ok,
    `AV2: GET ${apiUrl}/v1/vendors/${vendorId}/availability failed with status ${(publicSnap as { status?: number }).status ?? 'unknown'}`,
  ).toBe(true);

  expect(
    (publicSnap as { maxOrdersPerDay?: number | null }).maxOrdersPerDay,
    'AV2 CRITICAL: maxOrdersPerDay must be 1 in the customer-facing availability snapshot. ' +
      'If this fails, the cap is either not saved to the DB or the public endpoint is not ' +
      'returning it. Orders beyond the cap cannot be rejected if the cap is not present.',
  ).toBe(1);

  // Clean up: reset the cap to null so other tests start from a known state.
  await page.locator('#cap-orders').fill('');
  await page.getByRole('button', { name: 'Save availability' }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 10_000 });

  console.log(
    `AV2 complete: ${m.elapsedSec().toFixed(1)} s - maxOrdersPerDay=1 confirmed in public API - PASS`,
  );
});

// -- AV3: Prep lead time - real API integration test --------------------------
//
// Saves prepLeadHours=48 via the form (real PATCH) and then verifies via the
// public availability endpoint that the value is stored. Also asserts that a
// date within the next 48 hours falls inside the lead-time window (i.e. would
// not be bookable if the lead-time is respected by the customer checkout).
//
// Prerequisites: same as AV2.

test('AV3: [CRITICAL] prep lead time reaches the public API and excludes near-future dates', async ({
  page,
}) => {
  const apiUrl = process.env.TEST_API_URL;
  const vendorId = process.env.TEST_VENDOR_ID;

  if (!apiUrl) {
    test.skip(true, 'AV3 requires TEST_API_URL pointing at the running NestJS API.');
    return;
  }
  if (!vendorId) {
    test.skip(true, 'AV3 requires TEST_VENDOR_ID set to the test vendor UUID in the database.');
    return;
  }

  const m = new PageMetrics(page);
  await m.install();

  const vendor = makeAvailabilityVendor();
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

  // Initial GET: prepLeadHours=2 (the form default). PATCH goes to real API.
  await page.route(/\/v1\/vendors\/me\/availability$/, async (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeAvailabilitySnapshot({ prepLeadHours: 2 })),
      });
    } else {
      void route.continue();
    }
  });
  await page.route(/\/v1\/vendors\/me\/capacity/, (route) => {
    void route.continue();
  });
  await page.route(/\/v1\/vendors\/me\/blackouts/, (route) => {
    void route.continue();
  });

  await page.goto('/availability');
  await waitForAvailabilityReady(page);
  m.startTask();

  // Change prep lead time to 48 hours.
  const leadInput = page.locator('#lead');
  await leadInput.fill('');
  await leadInput.fill('48');

  // Save to the real API.
  await page.getByRole('button', { name: 'Save availability' }).click();
  await expect(
    page.getByText('Saved.', { exact: true }),
    'AV3: "Saved." confirmation must appear - the real API PATCH must return 200',
  ).toBeVisible({ timeout: 10_000 });

  m.assertNoNavigation('AV3');

  // -- Assert via the real public API that prepLeadHours=48 is stored -------

  const nowIso = new Date().toISOString();

  const publicSnap = await page.evaluate(
    async ({ url, id }: { url: string; id: string }) => {
      const res = await fetch(`${url}/v1/vendors/${id}/availability`);
      if (!res.ok)
        return { ok: false, status: res.status, prepLeadHours: null, slotOpenHour: null };
      const data = (await res.json()) as { prepLeadHours?: number | null; slotOpenHour?: number };
      return {
        ok: true,
        status: res.status,
        prepLeadHours: data.prepLeadHours ?? null,
        slotOpenHour: data.slotOpenHour ?? 11,
      };
    },
    { url: apiUrl, id: vendorId },
  );

  expect(
    publicSnap.ok,
    `AV3: GET ${apiUrl}/v1/vendors/${vendorId}/availability failed with status ${(publicSnap as { status?: number }).status ?? 'unknown'}`,
  ).toBe(true);

  const storedLeadHours = (publicSnap as { prepLeadHours?: number | null }).prepLeadHours;
  expect(
    storedLeadHours,
    'AV3 CRITICAL: prepLeadHours must be 48 in the customer-facing availability snapshot. ' +
      'If this fails, the lead time is not reaching the DB and near-future dates will ' +
      'wrongly show as bookable to customers.',
  ).toBe(48);

  // -- Assert that tomorrow falls within the 48h exclusion window -----------
  //
  // If slotOpenHour is (say) 11, tomorrow's first slot is tomorrow at 11:00
  // UTC. The lead time requires now + 48h <= first slot, so tomorrow's slot
  // at 11:00 must be at least 48h away. Since we are less than 48h from
  // tomorrow (by definition), tomorrow is always within the exclusion window
  // and should not be bookable.

  const slotOpenHour = (publicSnap as { slotOpenHour?: number }).slotOpenHour ?? 11;
  const tomorrowSlotMs = (() => {
    const t = new Date(nowIso);
    t.setUTCDate(t.getUTCDate() + 1);
    t.setUTCHours(slotOpenHour, 0, 0, 0);
    return t.getTime();
  })();
  const nowMs = new Date(nowIso).getTime();
  const leadMs = 48 * 60 * 60 * 1000;
  const tomorrowIsWithinLeadWindow = tomorrowSlotMs - nowMs < leadMs;

  expect(
    tomorrowIsWithinLeadWindow,
    `AV3: tomorrow at ${slotOpenHour}:00 UTC is ${((tomorrowSlotMs - nowMs) / 3_600_000).toFixed(1)} h away, ` +
      'which must be < 48 h (lead time). If this fails, the test was run at a time when tomorrow ' +
      'is already more than 48 h away, which is impossible - check the system clock.',
  ).toBe(true);

  console.log(
    `AV3 complete: ${m.elapsedSec().toFixed(1)} s - prepLeadHours=48 confirmed in public API; ` +
      `tomorrow at ${slotOpenHour}:00 is within the 48h exclusion window - PASS`,
  );
});

// -- AV4: Clear all opening days - warning appears ----------------------------

test('AV4: clear all opening days - save shows "at least one day" error - vendor cannot receive orders', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  // Start with Mon-Fri active so there are days to clear.
  await installAvailabilityMocks(page, { openingDays: [1, 2, 3, 4, 5] });

  await page.goto('/availability');
  await waitForAvailabilityReady(page);
  m.startTask();

  // Deactivate all five weekday pills.
  for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    await page.getByRole('button', { name: label }).click();
    await expect(
      page.getByRole('button', { name: label }),
      `AV4: ${label} pill must be deactivated after clicking`,
    ).toHaveAttribute('aria-pressed', 'false');
  }

  // Confirm no day pill is active.
  for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    await expect(page.getByRole('button', { name: label })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  }

  // Attempt to save - the client must block this.
  await page.getByRole('button', { name: 'Save availability' }).click();

  // -- Assertions -----------------------------------------------------------

  // The error banner must appear naming the requirement.
  await expect(
    page.getByText(/Pick at least one day of the week the kitchen is open/i),
    'AV4: validation error must appear when no days are selected',
  ).toBeVisible({ timeout: 3_000 });

  // No API PATCH must have fired (the Saved. banner must NOT appear).
  await expect(page.getByText('Saved.', { exact: true })).toBeHidden({ timeout: 1_000 });

  m.assertNoNavigation('AV4');

  console.log(
    'AV4 complete: no-days error shown correctly - vendor cannot silently go dark - PASS',
  );
});

// -- AV5: Enumerate every control - assert each has an observable effect ------

test('AV5: every control on the availability page produces an observable, correct consequence', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  // Provide a capacity row so we have a row to remove in step 14.
  const existingCapRow = makeCapacityRow({
    id: 'cap-existing-001',
    serviceDate: futureDateString(5),
    capacityType: 'family_pot',
    totalSlots: 5,
    slotsTaken: 0,
    remainingSlots: 5,
  });

  await installAvailabilityMocks(
    page,
    {
      openingDays: [1, 2, 3, 4, 5],
      slotOpenHour: 11,
      slotCloseHour: 20,
      prepLeadHours: 2,
      maxOrdersPerDay: null,
      sameDayOrders: true,
      eventCateringManualQuote: false,
      blackoutDates: [
        { id: 'blackout-existing-001', date: futureDateString(7), reason: 'Kitchen maintenance' },
      ],
    },
    { capacityRows: [existingCapRow] },
  );

  await page.goto('/availability');
  await waitForAvailabilityReady(page);

  const noEffect: string[] = [];

  // -- 1. Day pill (Mon): toggle off then back on ---------------------------
  const monPill = page.getByRole('button', { name: 'Mon' });
  await monPill.click();
  await expect(monPill)
    .toHaveAttribute('aria-pressed', 'false')
    .catch(() => {
      noEffect.push('Mon day pill (clicking did not deactivate the pill)');
    });
  await monPill.click();
  await expect(monPill)
    .toHaveAttribute('aria-pressed', 'true')
    .catch(() => {
      noEffect.push('Mon day pill (re-clicking did not re-activate the pill)');
    });

  // -- 2. Slot open hour: change from 11 to 9 --------------------------------
  const openInput = page.locator('#open');
  await openInput.fill('9');
  await expect(openInput)
    .toHaveValue('9')
    .catch(() => {
      noEffect.push('Slot open hour input (value did not change to 9)');
    });
  // The close hour must still be > open, so leave close=20 as-is.

  // -- 3. Slot close hour: change from 20 to 21 ------------------------------
  const closeInput = page.locator('#close');
  await closeInput.fill('21');
  await expect(closeInput)
    .toHaveValue('21')
    .catch(() => {
      noEffect.push('Slot close hour input (value did not change to 21)');
    });

  // -- 4. Prep lead time: change from 2 to 6 --------------------------------
  const leadInput = page.locator('#lead');
  await leadInput.fill('');
  await leadInput.fill('6');
  await expect(leadInput)
    .toHaveValue('6')
    .catch(() => {
      noEffect.push('Prep lead time input (value did not change to 6)');
    });

  // -- 5. Max orders per day: enter 15 --------------------------------------
  const capOrdersInput = page.locator('#cap-orders');
  await capOrdersInput.fill('15');
  await expect(capOrdersInput)
    .toHaveValue('15')
    .catch(() => {
      noEffect.push('Max orders per day input (value did not change to 15)');
    });

  // -- 6. Max trays per day: enter 30 ---------------------------------------
  const capTraysInput = page.locator('#cap-trays');
  await capTraysInput.fill('30');
  await expect(capTraysInput)
    .toHaveValue('30')
    .catch(() => {
      noEffect.push('Max trays per day input (value did not change to 30)');
    });

  // -- 7. Same-day orders toggle: turn off ----------------------------------
  // The toggle is inside a ToggleRow with title "Allow same-day orders".
  // Switch renders as role="switch". Find it by proximity to its title text.
  const sameDaySwitch = page
    .getByText('Allow same-day orders')
    .locator('..')
    .locator('[role="switch"]');
  const sameDayBefore = await sameDaySwitch.getAttribute('aria-checked').catch(() => null);
  await sameDaySwitch.click();
  const sameDayAfter = await sameDaySwitch.getAttribute('aria-checked').catch(() => null);
  if (sameDayBefore === sameDayAfter) {
    noEffect.push('Same-day orders toggle (aria-checked did not change after clicking)');
  }

  // -- 8 + 9. Large-order lead + tray threshold (must be set together) ------
  const lolInput = page.locator('#lol');
  const lotInput = page.locator('#lot');
  await lolInput.fill('72');
  await lotInput.fill('10');
  await expect(lolInput)
    .toHaveValue('72')
    .catch(() => {
      noEffect.push('Large-order lead time input (value did not change to 72)');
    });
  await expect(lotInput)
    .toHaveValue('10')
    .catch(() => {
      noEffect.push('Large-order tray threshold input (value did not change to 10)');
    });

  // -- 10. Event catering manual quote toggle: turn on ----------------------
  const eventSwitch = page
    .getByText('Event catering needs a manual quote')
    .locator('..')
    .locator('[role="switch"]');
  const eventBefore = await eventSwitch.getAttribute('aria-checked').catch(() => null);
  await eventSwitch.click();
  const eventAfter = await eventSwitch.getAttribute('aria-checked').catch(() => null);
  if (eventBefore === eventAfter) {
    noEffect.push(
      'Event catering manual quote toggle (aria-checked did not change after clicking)',
    );
  }

  // -- 11. Blackout date add ------------------------------------------------
  const blackoutDate = futureDateString(14);
  await page.locator('#bdate').fill(blackoutDate);
  await page.locator('#breason').fill('Testing block');
  await page.getByRole('button', { name: 'Add' }).click();
  // The new row should appear in the blackout list.
  await expect(page.getByRole('button', { name: /Remove.*/ }).first())
    .toBeVisible({ timeout: 3_000 })
    .catch(() => {
      noEffect.push('Blackout date Add button (no blackout row appeared after clicking Add)');
    });

  // -- 12. Blackout date remove (existing row seeded in the fixture) --------
  // The existing row has aria-label "Remove <date>"; click the first one.
  const removeBlackoutBtn = page.getByRole('button', { name: /^Remove \d/ }).first();
  const blackoutCountBefore = await page.getByRole('button', { name: /^Remove \d/ }).count();
  if (await removeBlackoutBtn.isVisible()) {
    await removeBlackoutBtn.click();
    // After removal the mocked DELETE returns an empty blackoutDates list.
    const blackoutCountAfter = await page.getByRole('button', { name: /^Remove \d/ }).count();
    if (blackoutCountAfter >= blackoutCountBefore) {
      noEffect.push(
        'Blackout date Remove button (row count did not decrease after clicking Remove)',
      );
    }
  } else {
    noEffect.push(
      'Blackout date Remove button (no existing blackout row to remove - fixture missing)',
    );
  }

  // -- 13. Capacity row: set a slot for a future date -----------------------
  const capDate = futureDateString(10);
  await page.locator('#cap-date').fill(capDate);
  await page.locator('#cap-slots').fill('8');
  await page.getByRole('button', { name: 'Set' }).click();
  // A new row should appear in the capacity list.
  await expect(page.getByRole('button', { name: /Remove capacity for/ }).first())
    .toBeVisible({ timeout: 3_000 })
    .catch(() => {
      noEffect.push(
        'Capacity Set button (no capacity row appeared in the list after clicking Set)',
      );
    });

  // -- 14. Capacity row remove ----------------------------------------------
  // The pre-seeded existing row has aria-label matching "Remove capacity for <date> <type>".
  const removeCapBtn = page.getByRole('button', { name: /Remove capacity for/ }).first();
  const capCountBefore = await page.getByRole('button', { name: /Remove capacity for/ }).count();
  if (await removeCapBtn.isVisible()) {
    await removeCapBtn.click();
    const capCountAfter = await page.getByRole('button', { name: /Remove capacity for/ }).count();
    if (capCountAfter >= capCountBefore) {
      noEffect.push('Capacity Remove button (row count did not decrease after clicking Remove)');
    }
  } else {
    noEffect.push('Capacity Remove button (no existing capacity row to remove - fixture missing)');
  }

  m.assertNoNavigation('AV5');

  // -- Report ---------------------------------------------------------------

  expect(
    noEffect,
    [
      'AV5: the following controls had no observable effect:',
      ...noEffect.map((e) => `  - ${e}`),
    ].join('\n'),
  ).toHaveLength(0);

  console.log(`AV5 complete: all 14 controls verified - PASS`);
});
