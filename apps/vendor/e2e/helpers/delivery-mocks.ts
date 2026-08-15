/**
 * API mock helpers for the delivery settings e2e suite.
 *
 * Mirrors the pattern in api-mocks.ts: route handlers are registered
 * per-test so each test starts with a clean slate. External postcodes.io
 * calls are also intercepted so no real network requests leave the runner.
 */
import type { Page, Route } from '@playwright/test';

// ── Shared IDs ────────────────────────────────────────────────────────────────

export const DELIVERY_IDS = {
  vendor: 'vendor-e2e-001',
  config: 'dconfig-e2e-001',
} as const;

// ── Postcodes.io fixtures ─────────────────────────────────────────────────────

/** Brixton / SW9 2JB */
export const KITCHEN_POSTCODE = 'SW92JB';
export const KITCHEN_LAT = 51.4627;
export const KITCHEN_LNG = -0.1145;
export const KITCHEN_DISTRICT = 'Lambeth';

/** Districts returned by compute-districts at various radii. */
export const DISTRICTS_5MI = ['SE24', 'SW2', 'SW9'];
export const DISTRICTS_8MI = ['SE24', 'SE5', 'SW2', 'SW4', 'SW9'];

// ── Fixture factories ─────────────────────────────────────────────────────────

export function makeDeliveryConfig(
  overrides: Partial<{
    types: string[];
    kitchenPostcode: string | null;
    latitude: number | null;
    longitude: number | null;
    localRadiusMiles: number;
    localFeePence: number;
    postcodes: string[];
    collectionLine1: string | null;
    collectionLine2: string | null;
    collectionTown: string | null;
    collectionPostcode: string | null;
    minOrderPence: number;
    freeDeliveryOverPence: number | null;
  }> = {},
) {
  return {
    id: DELIVERY_IDS.config,
    vendorId: DELIVERY_IDS.vendor,
    types: ['local'],
    kitchenPostcode: null,
    latitude: null,
    longitude: null,
    localRadiusMiles: 5,
    localFeePence: 0,
    postcodes: [],
    collectionLine1: null,
    collectionLine2: null,
    collectionTown: null,
    collectionPostcode: null,
    minOrderPence: 0,
    freeDeliveryOverPence: null,
    ...overrides,
  };
}

export function makeDeliveryVendor(
  overrides: Partial<{ businessName: string; status: string }> = {},
) {
  return {
    id: DELIVERY_IDS.vendor,
    businessName: "Kwame's Jollof Kitchen",
    status: 'live',
    slug: 'kwames-jollof-kitchen',
    ...overrides,
  };
}

// ── Route helpers ─────────────────────────────────────────────────────────────

/**
 * Intercept the external postcodes.io full-postcode lookup and return fixture data.
 * The form calls fetchPostcodeInfo() on blur and on seed.
 */
export async function mockPostcodesIoLookup(
  page: Page,
  postcode: string,
  lat: number,
  lng: number,
  district: string,
) {
  const clean = postcode.replace(/\s+/g, '').toUpperCase();
  await page.route(`https://api.postcodes.io/postcodes/${clean}`, (route: Route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        result: { postcode, latitude: lat, longitude: lng, admin_district: district },
      }),
    });
  });
}

/**
 * Intercept the external postcodes.io outcode-existence check.
 * Used when the vendor manually adds a district.
 */
export async function mockOutcodeExists(page: Page, outcode: string, exists: boolean) {
  const code = outcode.toUpperCase();
  await page.route(`https://api.postcodes.io/outcodes/${code}`, (route: Route) => {
    if (exists) {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 200, result: { outcode: code } }),
      });
    } else {
      void route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ status: 404, error: 'Outcode not found' }),
      });
    }
  });
}

/**
 * Install the standard mocks needed for the delivery page.
 *
 * - GET  /v1/vendors/me              -> vendor fixture
 * - GET  /v1/vendors/me/delivery-config -> configOverrides applied
 * - PUT  /v1/vendors/me/delivery-config -> echoes the request body back (success)
 * - GET  /v1/vendors/me/delivery-config/compute-districts -> districtsByRadius map
 * - Postcodes.io for SW9 2JB
 *
 * Returns a helper that lets individual tests re-mock the PUT to capture the body.
 */
export async function installDeliveryMocks(
  page: Page,
  configOverrides: Parameters<typeof makeDeliveryConfig>[0] = {},
  options: {
    /** Map of radiusMiles -> district list for compute-districts responses. */
    districtsByRadius?: Record<number, string[]>;
    /** Extra postcode lookups beyond the default SW9 2JB. */
    extraPostcodes?: { postcode: string; lat: number; lng: number; district: string }[];
  } = {},
) {
  const vendor = makeDeliveryVendor();
  const config = makeDeliveryConfig(configOverrides);
  const districtsByRadius = options.districtsByRadius ?? {
    5: DISTRICTS_5MI,
    8: DISTRICTS_8MI,
  };

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

  // GET/PUT /vendors/me/delivery-config (not compute-districts - that has its own pattern)
  await page.route(/\/v1\/vendors\/me\/delivery-config$/, async (route: Route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(config),
      });
    } else if (route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...config, ...body }),
      });
    } else {
      void route.continue();
    }
  });

  // GET /vendors/me/delivery-config/compute-districts
  await page.route(/\/v1\/vendors\/me\/delivery-config\/compute-districts/, (route: Route) => {
    const url = new URL(route.request().url());
    const miles = Number(url.searchParams.get('radiusMiles') ?? '5');
    const districts = districtsByRadius[miles] ?? districtsByRadius[5] ?? DISTRICTS_5MI;
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ districts }),
    });
  });

  // Default kitchen postcode
  await mockPostcodesIoLookup(page, KITCHEN_POSTCODE, KITCHEN_LAT, KITCHEN_LNG, KITCHEN_DISTRICT);

  // Extra postcode lookups (e.g. for D3)
  for (const p of options.extraPostcodes ?? []) {
    await mockPostcodesIoLookup(page, p.postcode, p.lat, p.lng, p.district);
  }
}

// ── Capture helper (mirrors captureNextRequest from api-mocks.ts) ─────────────

/**
 * Intercept the NEXT PUT to /vendors/me/delivery-config, capture its request
 * body as a parsed object, fulfil with the given status and body, then remove
 * the route handler so subsequent GETs use the base mock.
 */
export async function captureNextDeliveryPut(
  page: Page,
  responseBody: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    void page.route(/\/v1\/vendors\/me\/delivery-config$/, (route: Route) => {
      if (route.request().method() !== 'PUT') {
        void route.continue();
        return;
      }
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      void page.unroute(/\/v1\/vendors\/me\/delivery-config$/);
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseBody),
      });
      resolve(body);
    });
  });
}

// ── Page-ready helper ─────────────────────────────────────────────────────────

/**
 * Wait for the delivery settings page to be fully hydrated.
 * The "Save settings" button is rendered once the form seeds from the API.
 */
export async function waitForDeliveryReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');

  if (page.url().includes('/sign-in')) {
    throw new Error(
      'waitForDeliveryReady: redirected to /sign-in - auth session missing or expired.\n' +
        'Re-run with real vendor credentials:\n' +
        '  TEST_VENDOR_EMAIL=<email> TEST_VENDOR_PASSWORD=<password> ' +
        'npm run test:e2e --workspace=@feastpot/vendor',
    );
  }

  await page
    .getByRole('button', { name: 'Save settings' })
    .waitFor({ state: 'visible', timeout: 15_000 });
}
