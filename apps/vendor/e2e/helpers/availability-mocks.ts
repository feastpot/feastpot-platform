/**
 * API mock helpers for the availability settings e2e suite.
 *
 * Mirrors the pattern in delivery-mocks.ts: route handlers are registered
 * per-test so each test starts with a clean slate. AV2 and AV3 let the
 * PATCH /vendors/me/availability call pass through to the real NestJS API,
 * following the same integration-test pattern as D3.
 */
import type { Page, Route } from '@playwright/test';

// -- Shared IDs ---------------------------------------------------------------

export const AVAIL_IDS = {
  vendor: 'vendor-e2e-001',
  avail: 'avail-e2e-001',
  blackout: 'blackout-e2e-001',
  capacity: 'cap-e2e-001',
} as const;

// -- Fixture factories ---------------------------------------------------------

export function makeAvailabilitySnapshot(
  overrides: Partial<{
    openingDays: number[];
    slotOpenHour: number;
    slotCloseHour: number;
    prepLeadHours: number;
    maxOrdersPerDay: number | null;
    maxTraysPerDay: number | null;
    sameDayOrders: boolean;
    largeOrderLeadHours: number | null;
    largeOrderTrayThreshold: number | null;
    eventCateringManualQuote: boolean;
    blackoutDates: { id: string; date: string; reason: string | null }[];
  }> = {},
) {
  return {
    id: AVAIL_IDS.avail,
    openingDays: [1, 2, 3, 4, 5], // Mon-Fri (ISO weekday: 0=Sun, 6=Sat)
    slotOpenHour: 11,
    slotCloseHour: 20,
    prepLeadHours: 2,
    maxOrdersPerDay: null,
    maxTraysPerDay: null,
    sameDayOrders: true,
    largeOrderLeadHours: null,
    largeOrderTrayThreshold: null,
    eventCateringManualQuote: false,
    blackoutDates: [] as { id: string; date: string; reason: string | null }[],
    ...overrides,
  };
}

export function makeAvailabilityVendor(
  overrides: Partial<{ businessName: string; status: string }> = {},
) {
  return {
    id: AVAIL_IDS.vendor,
    businessName: "Kwame's Jollof Kitchen",
    status: 'live',
    slug: 'kwames-jollof-kitchen',
    ...overrides,
  };
}

export type CapacityRow = {
  id: string;
  serviceDate: string;
  capacityType: string;
  totalSlots: number;
  slotsTaken: number;
  remainingSlots: number;
  preorderCutoffAt: string | null;
};

export function makeCapacityRow(overrides: Partial<CapacityRow> = {}): CapacityRow {
  return {
    id: AVAIL_IDS.capacity,
    serviceDate: '2026-09-15',
    capacityType: 'family_pot',
    totalSlots: 10,
    slotsTaken: 0,
    remainingSlots: 10,
    preorderCutoffAt: null,
    ...overrides,
  };
}

// -- Route helpers -------------------------------------------------------------

/**
 * Install the standard mocks needed for the availability page.
 *
 * - GET  /v1/vendors/me                 -> vendor fixture
 * - GET  /v1/vendors/me/availability    -> snapshot fixture
 * - PATCH /v1/vendors/me/availability   -> echoes merged result back (success)
 * - POST/DELETE /v1/vendors/me/blackouts -> synthetic blackout lifecycle
 * - GET/PUT/DELETE /v1/vendors/me/capacity -> capacity row lifecycle
 *
 * AV2 and AV3 call installAvailabilityMocks for vendor/snapshot GET only,
 * then route.continue() lets the PATCH reach the real NestJS API.
 */
export async function installAvailabilityMocks(
  page: Page,
  snapshotOverrides: Parameters<typeof makeAvailabilitySnapshot>[0] = {},
  options: {
    capacityRows?: CapacityRow[];
    /** When true the PATCH is NOT intercepted, so it reaches the real API. */
    passthroughPatch?: boolean;
  } = {},
) {
  const vendor = makeAvailabilityVendor();
  const snapshot = makeAvailabilitySnapshot(snapshotOverrides);
  const capacityRows = options.capacityRows ?? [];

  // GET /vendors/me
  await page.route(/\/v1\/vendors\/me$/, (route: Route) => {
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

  // GET/PATCH /vendors/me/availability
  await page.route(/\/v1\/vendors\/me\/availability$/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(snapshot),
      });
    } else if (method === 'PATCH') {
      if (options.passthroughPatch) {
        void route.continue();
      } else {
        const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...snapshot, ...body }),
        });
      }
    } else {
      void route.continue();
    }
  });

  // POST/DELETE /vendors/me/blackouts (individual blackout records)
  await page.route(/\/v1\/vendors\/me\/blackouts/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        date?: string;
        reason?: string;
      };
      const newRow = { id: 'blackout-new-001', date: body.date ?? '', reason: body.reason ?? null };
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...snapshot, blackoutDates: [...snapshot.blackoutDates, newRow] }),
      });
    } else if (method === 'DELETE') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...snapshot, blackoutDates: [] }),
      });
    } else {
      void route.continue();
    }
  });

  // GET/PUT/DELETE /vendors/me/capacity
  await page.route(/\/v1\/vendors\/me\/capacity/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(capacityRows),
      });
    } else if (method === 'PUT') {
      if (options.passthroughPatch) {
        void route.continue();
      } else {
        const body = JSON.parse(route.request().postData() ?? '{}') as {
          serviceDate?: string;
          capacityType?: string;
          totalSlots?: number;
        };
        const newRow: CapacityRow = {
          id: AVAIL_IDS.capacity,
          serviceDate: body.serviceDate ?? '',
          capacityType: body.capacityType ?? 'family_pot',
          totalSlots: body.totalSlots ?? 1,
          slotsTaken: 0,
          remainingSlots: body.totalSlots ?? 1,
          preorderCutoffAt: null,
        };
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([...capacityRows, newRow]),
        });
      }
    } else if (method === 'DELETE') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    } else {
      void route.continue();
    }
  });
}

// -- Capture helper -----------------------------------------------------------

/**
 * Intercept the NEXT PATCH to /vendors/me/availability, capture its request
 * body as a parsed object, fulfil with the given status and body, then remove
 * the route handler so subsequent GETs use the base mock.
 */
export async function captureNextAvailabilityPatch(
  page: Page,
  responseBody: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    void page.route(/\/v1\/vendors\/me\/availability$/, (route: Route) => {
      if (route.request().method() !== 'PATCH') {
        void route.continue();
        return;
      }
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      void page.unroute(/\/v1\/vendors\/me\/availability$/);
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseBody),
      });
      resolve(body);
    });
  });
}

// -- Page-ready helper --------------------------------------------------------

/**
 * Wait for the availability page to be fully hydrated.
 * "Save availability" is the stable signal that the form has seeded from the API.
 */
export async function waitForAvailabilityReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');

  if (page.url().includes('/sign-in')) {
    throw new Error(
      'waitForAvailabilityReady: redirected to /sign-in - auth session missing or expired.\n' +
        'Re-run with real vendor credentials:\n' +
        '  TEST_VENDOR_EMAIL=<email> TEST_VENDOR_PASSWORD=<password> ' +
        'npm run test:e2e --workspace=@feastpot/vendor',
    );
  }

  await page
    .getByRole('button', { name: 'Save availability' })
    .waitFor({ state: 'visible', timeout: 15_000 });
}

// -- Date helpers -------------------------------------------------------------

/** Return a YYYY-MM-DD date string N days from today (UTC). */
export function futureDateString(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
