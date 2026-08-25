/**
 * API mock helpers for the Performance screen e2e suite.
 *
 * The rate schedule is the critical fixture: PF1 asserts all three tiers
 * render, and PF2 asserts the notice period matches PLATFORM_FACTS.
 */
import type { Page } from '@playwright/test';

export const PERF_IDS = {
  vendor: 'vendor-e2e-001',
} as const;

function isoFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Three-tier rate schedule matching PLATFORM_FACTS.commission values. */
export function makeRateSchedule() {
  return [
    {
      id: 'rs-vendor',
      label: 'Your own customers via your personal link',
      commissionPercent: 0,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'rs-repeat',
      label: 'Repeat marketplace orders',
      commissionPercent: 10,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'rs-first',
      label: 'First-time marketplace orders',
      commissionPercent: 12,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
    },
  ];
}

/** Eight weeks of weekly revenue data with date-labelled weeks. */
export function makeEarningsData() {
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (7 - i) * 7);
    return {
      weekLabel: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      weekStartIso: d.toISOString(),
      foodSubtotalPence: 38_000 + i * 4_000,
      commissionPence: 3_800 + i * 400,
      serviceFeeRevenuePence: 1_900 + i * 200,
      vendorPayoutPence: 34_200 + i * 3_600,
    };
  });
  return {
    weeks,
    totalFoodSubtotalPence: weeks.reduce((s, w) => s + w.foodSubtotalPence, 0),
    totalCommissionPence: weeks.reduce((s, w) => s + w.commissionPence, 0),
    totalVendorPayoutPence: weeks.reduce((s, w) => s + w.vendorPayoutPence, 0),
  };
}

/** 24-hour order distribution, Europe/London-aligned, peak at lunch and early evening. */
export function makeAnalyticsData() {
  return {
    hourly: Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      orderCount:
        h >= 11 && h <= 13
          ? 6 + h - 11
          : h >= 17 && h <= 20
            ? 9 + 20 - h
            : Math.max(0, Math.floor(Math.random() * 2)),
    })),
    topItems: [
      { name: 'Sunday Jollof Rice', orderCount: 42, revenuePence: 63_000 },
      { name: 'Suya Platter', orderCount: 28, revenuePence: 42_000 },
      { name: 'Pepper Soup', orderCount: 19, revenuePence: 15_200 },
    ],
  };
}

/** Payout summary including founding allowance fields. */
export function makePayoutSummary() {
  return {
    lastPayoutPence: 18_750,
    lastPayoutDate: isoFromNow(-7),
    pendingPence: 4_200,
    foundingAllowanceGrantedPence: 200_000,
    foundingAllowanceUsedPence: 45_000,
    totalCommissionPaidPence: 5_400,
    totalFoodSubtotalPence: 95_000,
  };
}

/** Empty but valid responses for a newly-live vendor with no order history. */
export function makeEmptyPerformanceData() {
  return {
    analytics: {
      weeklyRevenue: [],
      topDishes: [],
      hourlyDistribution: [],
      averageOrderValuePence: 0,
      reorderRatePct: 0,
    },
    earnings: {
      period: { blendedRatePct: 0, savedPence: 0, bySource: [] },
      cumulative: { blendedRatePct: 0, savedPence: 0, bySource: [] },
    },
    payoutSummary: {
      foundingAllowanceGrantedPence: 0,
      foundingAllowanceUsedPence: 0,
    },
  };
}

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

export async function installPerformanceMocks(
  page: Page,
  opts: { empty?: boolean } = {},
): Promise<void> {
  const empty = opts.empty ? makeEmptyPerformanceData() : null;
  await mockAlways(page, '**/v1/vendors/me', 200, {
    id: PERF_IDS.vendor,
    businessName: "Kwame's Jollof Kitchen",
    status: 'live',
  });
  await mockAlways(page, '**/v1/inbox/unread-count', 200, { count: 0 });
  await mockAlways(page, '**/v1/vendor-members/my-role', 200, { role: 'owner' });

  await mockAlways(page, '**/v1/terms/rate-schedule', 200, makeRateSchedule());
  await mockAlways(
    page,
    /\/v1\/vendors\/[^/]+\/analytics(\?.*)?$/,
    200,
    empty?.analytics ?? makeAnalyticsData(),
  );
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/earnings(\?.*)?$/, 200, makeEarningsData());
  await mockAlways(
    page,
    '**/v1/payouts/earnings-summary**',
    200,
    empty?.earnings ?? {
      period: { blendedRatePct: 8.5, savedPence: 1200, bySource: [] },
      cumulative: { blendedRatePct: 8.5, savedPence: 1200, bySource: [] },
    },
  );
  await mockAlways(page, '**/v1/payouts/summary', 200, empty?.payoutSummary ?? makePayoutSummary());
}
