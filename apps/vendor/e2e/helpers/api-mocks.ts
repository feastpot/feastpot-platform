/**
 * API mock helpers for the vendor portal e2e suite.
 *
 * Every helper intercepts the pattern `**\/v1\/**` which catches all
 * Feastpot API calls regardless of NEXT_PUBLIC_API_URL. The route
 * handler is registered per-test so each test starts with a clean slate.
 *
 * Fixtures are kept minimal: only the fields the DishesClient and its
 * hooks actually read. If the API adds fields later, the client should
 * degrade gracefully anyway.
 */
import type { Page, Route } from '@playwright/test';

// ── Shared IDs ──────────────────────────────────────────────────────────────

export const ID = {
  vendor: 'vendor-e2e-001',
  menu: 'menu-e2e-001',
  itemLive: 'item-e2e-live',
  itemDraft: 'item-e2e-draft',
  itemSoldOut: 'item-e2e-soldout',
} as const;

// ── Fixture factory functions ────────────────────────────────────────────────

type Override<T> = Partial<T>;

function baseTimestamps() {
  return { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
}

export function makeVendor(o: Override<{ businessName: string; status: string }> = {}) {
  return {
    id: ID.vendor,
    businessName: o.businessName ?? "Kwame's Jollof Kitchen",
    status: o.status ?? 'live',
  };
}

export function makeMenu() {
  return {
    id: ID.menu,
    vendorId: ID.vendor,
    name: 'Dishes',
    isActive: true,
    sortOrder: 1,
    ...baseTimestamps(),
  };
}

export function makeItem(
  id: string,
  overrides: Override<{
    name: string;
    category: string;
    pricePence: number;
    isAvailable: boolean;
    moderationStatus: string;
    allergens: string[];
    allergensFreeFrom: boolean;
    tags: string[];
    sortOrder: number;
    imageUrls: string[];
  }> = {},
) {
  return {
    id,
    vendorId: ID.vendor,
    menuId: ID.menu,
    name: overrides.name ?? 'Test Dish',
    description: null,
    category: overrides.category ?? 'tray',
    pricePence: overrides.pricePence ?? 1500,
    servingsCount: null,
    preparationHours: 1,
    imageUrls: overrides.imageUrls ?? [],
    allergens: overrides.allergens ?? ['nuts'],
    allergensFreeFrom: overrides.allergensFreeFrom ?? false,
    tags: overrides.tags ?? [],
    sortOrder: overrides.sortOrder ?? 1,
    isAvailable: overrides.isAvailable ?? true,
    moderationStatus: overrides.moderationStatus ?? 'auto_approved',
    ...baseTimestamps(),
  };
}

// ── Convenience fixtures ─────────────────────────────────────────────────────

export const LIVE_ITEM = makeItem(ID.itemLive, {
  name: 'Sunday Jollof Rice',
  category: 'tray',
  pricePence: 1500,
  isAvailable: true,
  moderationStatus: 'auto_approved',
  allergens: ['nuts', 'milk'],
  allergensFreeFrom: false,
  tags: [],
  sortOrder: 1,
});

export const SOLD_OUT_ITEM = makeItem(ID.itemSoldOut, {
  name: 'Pepper Soup',
  category: 'soup',
  pricePence: 800,
  isAvailable: false,
  moderationStatus: 'auto_approved',
  allergens: ['nuts'],
  allergensFreeFrom: false,
  tags: ['sold_out'],
  sortOrder: 1,
});

export const DRAFT_ITEM = makeItem(ID.itemDraft, {
  name: 'Egusi Soup',
  category: 'soup',
  pricePence: 1200,
  isAvailable: false,
  moderationStatus: 'auto_approved',
  allergens: [],
  allergensFreeFrom: false,
  tags: [],
  sortOrder: 2,
});

// ── Route mock helpers ───────────────────────────────────────────────────────

type JsonBody = unknown;

/**
 * Register a one-time route handler that responds with `body` the first
 * time a matching URL is requested, then falls through to the real network.
 * Use for mutations (POST, PATCH) where you need to capture the request
 * body and respond once.
 */
export async function mockOnce(
  page: Page,
  urlPattern: string | RegExp,
  status: number,
  body: JsonBody,
): Promise<void> {
  await page.route(urlPattern, async (route: Route) => {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    await page.unroute(urlPattern);
  });
}

/**
 * Register a persistent route that always responds with `body`.
 * Replace it by calling page.unroute() or registering a more-specific pattern.
 */
export async function mockAlways(
  page: Page,
  urlPattern: string | RegExp,
  status: number,
  body: JsonBody,
): Promise<void> {
  await page.route(urlPattern, (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/**
 * Intercept the next request matching `urlPattern`, capture its parsed JSON
 * body, fulfil it with `responseBody`, and resolve the returned promise
 * with the request payload. Useful for asserting what the client sent.
 */
export function captureNextRequest(
  page: Page,
  urlPattern: string | RegExp,
  responseStatus: number,
  responseBody: JsonBody,
): Promise<JsonBody> {
  return new Promise((resolve) => {
    page.route(urlPattern, async (route: Route) => {
      let payload: JsonBody = null;
      try {
        const raw = route.request().postData();
        payload = raw ? (JSON.parse(raw) as JsonBody) : null;
      } catch {
        payload = null;
      }
      await route.fulfill({
        status: responseStatus,
        contentType: 'application/json',
        body: JSON.stringify(responseBody),
      });
      await page.unroute(urlPattern);
      resolve(payload);
    });
  });
}

/**
 * Set up the baseline mocks every test needs:
 *   GET /vendors/me                        -> vendor
 *   GET /vendors/:id/menus?*               -> [menu] (or [] when noMenu=true)
 *   GET /vendors/:id/menus/:menuId/items*  -> items
 *   POST /vendors/:id/menus               -> menu (for auto-create)
 *
 * Call this AFTER page.addInitScript but BEFORE page.goto.
 */
export async function installBaseMocks(
  page: Page,
  items: JsonBody[] = [],
  opts: { noMenu?: boolean; businessName?: string } = {},
): Promise<void> {
  const vendor = makeVendor({ businessName: opts.businessName });
  const menus = opts.noMenu ? [] : [makeMenu()];
  const menu = makeMenu();

  await mockAlways(page, '**/v1/vendors/me', 200, vendor);
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/menus(\?.*)?$/, 200, menus);
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items(\?.*)?$/, 200, items);
  // Auto-create menu path
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/menus$/, 200, menu);
  // Inbox (unread count badge in TopNav)
  await mockAlways(page, '**/v1/inbox/unread-count', 200, { count: 0 });
  // Vendor role (nav filtering)
  await mockAlways(page, '**/v1/vendor-members/my-role', 200, { role: 'owner' });
}

/** Generate N distinct dish fixtures spread across categories. */
export function makeDishList(count: number): ReturnType<typeof makeItem>[] {
  const cats = ['tray', 'soup', 'protein', 'swallow', 'snack', 'frozen', 'bundle', 'event'];
  return Array.from({ length: count }, (_, i) =>
    makeItem(`item-bulk-${i}`, {
      name: `Dish ${i + 1}`,
      category: cats[i % cats.length] as string,
      pricePence: 1000 + i * 50,
      isAvailable: true,
      moderationStatus: 'auto_approved',
      allergens: ['nuts'],
      allergensFreeFrom: false,
      tags: [],
      sortOrder: i + 1,
    }),
  );
}
