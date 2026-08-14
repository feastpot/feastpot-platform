/**
 * API mock helpers for the verification-state-banner e2e suite.
 *
 * Intercepts all `**\/v1\/**` patterns so test assertions are deterministic
 * regardless of whether the NestJS API is running. Server-side Next.js
 * fetches (GET /vendors/me) go through the real API using the stored auth
 * credentials; all client-side hook calls are intercepted here.
 */
import type { Page } from '@playwright/test';

// ── IDs shared across fixtures ───────────────────────────────────────────────

export const VB_IDS = {
  vendor: 'vendor-e2e-001',
} as const;

// ── Date helpers ─────────────────────────────────────────────────────────────

/** ISO date string for a date N days from today. */
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

// ── Fixture factories ─────────────────────────────────────────────────────────

export type VerificationOverallState = 'VERIFIED' | 'RENEWAL_DUE' | 'SUSPENDED';

export interface VerificationFixture {
  id: string;
  vendorId: string;
  registrationNumber: string;
  registrationAuthority: string;
  registrationConfirmedAt: string;
  fhrsRating: number | null;
  fhrsRatingCheckedAt: string | null;
  fhrsInspectionStatus: string;
  insuranceProvider: string | null;
  insuranceValidUntil: string | null;
  allergenTrainingHeld: boolean;
  allergenTrainingUntil: string | null;
  idVerifiedAt: string;
  overallState: VerificationOverallState;
  updatedAt: string;
}

/**
 * Base verification fixture -- all documents healthy, state VERIFIED.
 * Override individual fields to drive specific test scenarios.
 */
export function makeVerificationRecord(
  overrides: Partial<VerificationFixture> = {},
): VerificationFixture {
  return {
    id: 'vv-e2e-001',
    vendorId: VB_IDS.vendor,
    registrationNumber: 'REG-12345',
    registrationAuthority: 'Test Council',
    registrationConfirmedAt: daysFromNow(-365),
    fhrsRating: 5,
    fhrsRatingCheckedAt: daysFromNow(-30),
    fhrsInspectionStatus: 'RATED',
    insuranceProvider: 'Acme Insurance',
    // Healthy: valid for another year.
    insuranceValidUntil: daysFromNow(365),
    allergenTrainingHeld: true,
    allergenTrainingUntil: daysFromNow(365),
    idVerifiedAt: daysFromNow(-90),
    overallState: 'VERIFIED',
    updatedAt: daysFromNow(-1),
    ...overrides,
  };
}

/** Verification fixture for a vendor whose insurance is expired (SUSPENDED, self-service remedy). */
export function makeSuspendedRecord(): VerificationFixture {
  return makeVerificationRecord({
    overallState: 'SUSPENDED',
    insuranceValidUntil: daysFromNow(-10), // expired 10 days ago
  });
}

/** Verification fixture for SUSPENDED with no document-level issue (enforcement suspension). */
export function makeEnforcementSuspendedRecord(): VerificationFixture {
  return makeVerificationRecord({
    overallState: 'SUSPENDED',
    // Docs are fine -- suspension is from enforcement, not document expiry.
    insuranceValidUntil: daysFromNow(200),
    allergenTrainingUntil: daysFromNow(200),
  });
}

/** Verification fixture for RENEWAL_DUE with insurance expiring in 20 days. */
export function makeRenewalDueRecord(): VerificationFixture {
  return makeVerificationRecord({
    overallState: 'RENEWAL_DUE',
    insuranceValidUntil: daysFromNow(20),
  });
}

// ── Route mock helper ─────────────────────────────────────────────────────────

async function mockAlways(
  page: Page,
  pattern: string | RegExp,
  status: number,
  body: unknown,
): Promise<void> {
  await page.route(pattern, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  );
}

// ── Minimal stats/dashboard fixtures ─────────────────────────────────────────

function makeStatsFixture() {
  return {
    today: { orders: 0, revenuePence: 0 },
    pendingNow: 0,
    weekOrders: 0,
    weekRevenuePence: 0,
  };
}

function makeDashboardFixture() {
  return {
    ordersDueToday: [],
    upcomingOrders: [],
    eventEnquiries: { pending: 0, nextEventDate: null },
    nextPayout: null,
    menuHealth: { missingImages: 0, missingAllergens: 0, items: [] },
  };
}

// ── installVerificationBannerMocks ────────────────────────────────────────────

/**
 * Install all mocks needed for the dashboard to render with a specific
 * verification state.
 *
 * - GET /vendors/*/verification  -> verificationRecord
 * - GET /vendors/*/documents     -> [] (ComplianceAlerts shows "all good")
 * - GET /vendors/me/stats        -> zeroed stats (page renders without crashing)
 * - GET /vendors/me/dashboard    -> empty dashboard data
 * - GET /inbox/unread-count      -> {count: 0}
 * - GET /vendor-members/my-role  -> {role: 'owner'}
 *
 * Server-side GET /vendors/me goes to the real API (uses stored auth).
 * All client-side hook calls are intercepted by these mocks.
 */
export async function installVerificationBannerMocks(
  page: Page,
  verificationRecord: VerificationFixture,
): Promise<void> {
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/verification/, 200, verificationRecord);
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/documents(\?.*)?$/, 200, []);
  await mockAlways(page, '**/v1/vendors/me/stats', 200, makeStatsFixture());
  await mockAlways(page, '**/v1/vendors/me/dashboard', 200, makeDashboardFixture());
  await mockAlways(page, '**/v1/inbox/unread-count', 200, { count: 0 });
  await mockAlways(page, '**/v1/vendor-members/my-role', 200, { role: 'owner' });
}
