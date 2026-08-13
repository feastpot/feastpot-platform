/**
 * API mock helpers for the profile settings e2e suite.
 *
 * Mirrors the pattern in api-mocks.ts: route handlers are registered
 * per-test so each test starts with a clean slate.
 */
import type { Page, Route } from '@playwright/test';

// ── Shared IDs ────────────────────────────────────────────────────────────────

export const PROFILE_IDS = {
  vendor: 'vendor-e2e-001',
  itemA: 'item-e2e-featured-a',
  itemB: 'item-e2e-featured-b',
  itemC: 'item-e2e-featured-c',
} as const;

// ── Fixture factories ─────────────────────────────────────────────────────────

export function makeVendorProfile(
  overrides: Partial<{
    businessName: string;
    slug: string;
    description: string | null;
    cuisines: string[];
    specialities: string[];
    featuredDishes: string[];
    vendorStory: string | null;
    logoUrl: string | null;
    coverImageUrl: string | null;
    socialLinks: Record<string, string> | null;
    featuredDishDetails: { id: string; name: string }[];
  }> = {},
) {
  return {
    id: PROFILE_IDS.vendor,
    businessName: "Kwame's Jollof Kitchen",
    slug: 'kwames-jollof-kitchen',
    description: null,
    cuisines: [],
    specialities: [],
    featuredDishes: [],
    featuredDishDetails: [],
    vendorStory: null,
    logoUrl: null,
    coverImageUrl: null,
    socialLinks: null,
    status: 'live',
    ...overrides,
  };
}

export function makeLiveMenuItem(
  id: string,
  name: string,
  overrides: Partial<{ imageUrls: string[] }> = {},
) {
  return {
    id,
    name,
    imageUrls: overrides.imageUrls ?? [],
    isAvailable: true,
    moderationStatus: 'auto_approved',
  };
}

// ── Convenience fixtures ──────────────────────────────────────────────────────

export const LIVE_ITEM_A = makeLiveMenuItem(PROFILE_IDS.itemA, 'Sunday Jollof Rice');
export const LIVE_ITEM_B = makeLiveMenuItem(PROFILE_IDS.itemB, 'Egusi Soup');
export const LIVE_ITEM_C = makeLiveMenuItem(PROFILE_IDS.itemC, 'Puff Puff');

// ── Route helpers ─────────────────────────────────────────────────────────────

/**
 * Install the standard mocks needed for the profile settings page.
 *
 * - GET  /v1/vendors/me                         -> vendor profile fixture
 * - PATCH /v1/vendors/:id                       -> echoes request body back (success)
 * - GET  /v1/vendors/:id/live-menu-items        -> liveItems fixture
 * - POST /v1/vendors/:id/logo (and /cover)      -> upload success
 * - GET  /v1/vendors/slug-redirect/:slug        -> 404 (no redirect by default)
 */
export async function installProfileMocks(
  page: Page,
  profileOverrides: Parameters<typeof makeVendorProfile>[0] = {},
  options: {
    liveItems?: ReturnType<typeof makeLiveMenuItem>[];
    /** Override slug-redirect response. Null = 404, string = target slug. */
    slugRedirect?: string | null;
  } = {},
) {
  const vendor = makeVendorProfile(profileOverrides);
  const liveItems = options.liveItems ?? [LIVE_ITEM_A, LIVE_ITEM_B, LIVE_ITEM_C];

  // GET /vendors/me  (the profile hook calls /vendors/me to get vendor details)
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

  // GET /vendors/me (alternative route pattern some hooks may use)
  // PATCH /v1/vendors/:id  (profile update)
  await page.route(/\/v1\/vendors\/[^/]+$/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(vendor),
      });
    } else if (method === 'PATCH' || method === 'PUT') {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...vendor, ...body }),
      });
    } else {
      void route.continue();
    }
  });

  // GET /v1/vendors/:id/live-menu-items
  await page.route(/\/v1\/vendors\/[^/]+\/live-menu-items$/, (route: Route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(liveItems),
      });
    } else {
      void route.continue();
    }
  });

  // POST /v1/vendors/:id/images (logo / cover uploads)
  await page.route(/\/v1\/vendors\/[^/]+\/images$/, (route: Route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ path: 'uploads/test.jpg', publicUrl: 'https://cdn.example.com/test.jpg' }),
    });
  });

  // GET /v1/vendors/slug-redirect/:slug
  const redirectTarget = options.slugRedirect ?? null;
  await page.route(/\/v1\/vendors\/slug-redirect\//, (route: Route) => {
    if (redirectTarget) {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ slug: redirectTarget }),
      });
    } else {
      void route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not found' }) });
    }
  });
}

/**
 * Re-mock the live-menu-items endpoint with a new list (to simulate a dish
 * going to draft). Call after installProfileMocks() has run.
 */
export async function updateLiveItemsMock(
  page: Page,
  newItems: ReturnType<typeof makeLiveMenuItem>[],
) {
  await page.unroute(/\/v1\/vendors\/[^/]+\/live-menu-items$/);
  await page.route(/\/v1\/vendors\/[^/]+\/live-menu-items$/, (route: Route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(newItems),
      });
    } else {
      void route.continue();
    }
  });
}

/**
 * Intercept the NEXT PATCH/PUT to /vendors/:id, capture its request body,
 * fulfil with the given responseBody, then remove the handler.
 */
export async function captureNextProfileSave(
  page: Page,
  responseBody: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    void page.route(/\/v1\/vendors\/[^/]+$/, (route: Route) => {
      const method = route.request().method();
      if (method !== 'PATCH' && method !== 'PUT') {
        void route.continue();
        return;
      }
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      void page.unroute(/\/v1\/vendors\/[^/]+$/);
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
 * Wait for the profile settings page to be fully hydrated.
 * The "Save profile" button is rendered once the vendor data is loaded.
 */
export async function waitForProfileReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');

  if (page.url().includes('/sign-in')) {
    throw new Error(
      'waitForProfileReady: redirected to /sign-in - auth session missing or expired.\n' +
        'Re-run with real vendor credentials:\n' +
        '  TEST_VENDOR_EMAIL=<email> TEST_VENDOR_PASSWORD=<password> ' +
        'npm run test:e2e --workspace=@feastpot/vendor',
    );
  }

  await page
    .getByRole('button', { name: 'Save profile' })
    .waitFor({ state: 'visible', timeout: 15_000 });
}
