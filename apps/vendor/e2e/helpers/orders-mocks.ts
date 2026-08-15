/**
 * API mock helpers for the merged Orders screen e2e suite.
 *
 * All route patterns use ** prefix so they match regardless of
 * NEXT_PUBLIC_API_URL. Server-side Next.js fetches go to the real API;
 * client-side hook calls are intercepted here.
 */
import type { Page } from '@playwright/test';

export const ORDERS_IDS = {
  vendor: 'vendor-e2e-001',
  orderPending: 'order-e2e-pending',
  orderAccepted: 'order-e2e-accepted',
  cateringQuoted: 'catering-e2e-quoted',
  cateringConfirmed: 'catering-e2e-confirmed',
} as const;

function isoFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function makeOrder(
  id: string,
  status: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    orderNumber: `FP-${id.slice(-4).toUpperCase()}`,
    status,
    vendorId: ORDERS_IDS.vendor,
    customerName: 'Test Customer',
    items: [{ id: 'item-1', name: 'Jollof Rice', quantity: 2, pricePence: 1500 }],
    foodSubtotalPence: 3000,
    serviceFeePercent: 5,
    serviceFeeCapPence: 299,
    serviceFeePence: 150,
    commissionPercent: 10,
    commissionPence: 300,
    vendorPayoutPence: 2700,
    deliveryDate: isoFromNow(3),
    deliveryType: 'delivery',
    addressLine1: '1 Test Street',
    postcode: 'SE15 4AB',
    allergens: [],
    notes: null,
    createdAt: isoFromNow(-1),
    updatedAt: isoFromNow(-1),
    ...overrides,
  };
}

export function makeCateringBooking(
  id: string,
  status: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    vendorId: ORDERS_IDS.vendor,
    customerName: 'Event Customer',
    customerEmail: 'event@test.io',
    customerPhone: '07700900000',
    eventDate: isoFromNow(14),
    eventDescription: 'Wedding reception for 100 guests, Nigerian cuisine',
    guestCount: 100,
    budgetPence: 250_000,
    status,
    quoteAmountPence: status === 'QUOTED' || status === 'DEPOSIT_PAID' ? 180_000 : null,
    createdAt: isoFromNow(-3),
    updatedAt: isoFromNow(-1),
    ...overrides,
  };
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

/** Standard order awaiting vendor action. */
export const PENDING_ORDER = makeOrder(ORDERS_IDS.orderPending, 'pending');
/** Standard order being prepared (in progress). */
export const ACCEPTED_ORDER = makeOrder(ORDERS_IDS.orderAccepted, 'accepted');
/** Catering booking needing a quote (awaiting vendor action). */
export const QUOTED_CATERING = makeCateringBooking(ORDERS_IDS.cateringQuoted, 'QUOTED');
/** Catering booking already confirmed (in progress). */
export const CONFIRMED_CATERING = makeCateringBooking(ORDERS_IDS.cateringConfirmed, 'CONFIRMED');

// ── Mock installer ────────────────────────────────────────────────────────────

async function mockAlways(
  page: Page,
  pattern: string | RegExp,
  status: number,
  body: unknown,
): Promise<void> {
  await page.route(pattern, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/**
 * Install all mocks the Orders screen needs.
 *
 * Counts in the resulting dataset:
 *   All > Needs action:   1 standard (pending) + 1 catering (QUOTED) = 2
 *   Standard > Pending:   1
 *   Catering > Quoted:    1
 */
export async function installOrdersMocks(
  page: Page,
  opts: {
    activeOrders?: unknown[];
    cateringBookings?: unknown[];
  } = {},
): Promise<void> {
  const activeOrders = opts.activeOrders ?? [PENDING_ORDER, ACCEPTED_ORDER];
  const cateringBookings = opts.cateringBookings ?? [QUOTED_CATERING, CONFIRMED_CATERING];

  await mockAlways(page, '**/v1/vendors/me', 200, {
    id: ORDERS_IDS.vendor,
    businessName: "Kwame's Jollof Kitchen",
    status: 'live',
  });
  await mockAlways(page, '**/v1/inbox/unread-count', 200, { count: 0 });
  await mockAlways(page, '**/v1/vendor-members/my-role', 200, { role: 'owner' });

  // Active orders (pending, accepted, preparing …)
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/orders(?:\/active)?(\?.*)?$/, 200, activeOrders);
  // Cancelled orders endpoint (separate hook)
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/orders\/cancelled(\?.*)?$/, 200, []);
  // Delivered / history orders
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/orders\/history(\?.*)?$/, 200, []);

  // Catering bookings
  await mockAlways(
    page,
    /\/v1\/vendors\/[^/]+\/catering-bookings(\?.*)?$/,
    200,
    cateringBookings,
  );
}
