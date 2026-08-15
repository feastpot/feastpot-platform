/**
 * API mock helpers for the Account and compliance screen e2e suite.
 *
 * Server-side fetches (GET /vendors/me, GET /vendors/:id/verification,
 * GET /terms/versions/me*) go to the real NestJS API using stored auth
 * credentials. Client-side hooks (useAccountStatus, useVendorDocuments)
 * are intercepted here.
 */
import type { Page } from '@playwright/test';

export const COMPLIANCE_IDS = {
  vendor: 'vendor-e2e-001',
  enforcementActionId: 'ea-comp-e2e-001',
} as const;

function isoFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function makeEnforcementAction(overrides: Record<string, unknown> = {}) {
  return {
    id: COMPLIANCE_IDS.enforcementActionId,
    vendorId: COMPLIANCE_IDS.vendor,
    actionType: 'SUSPENSION',
    reasonCode: 'FOOD_SAFETY',
    reasonNarrative:
      'A complaint was received regarding food safety standards on 5 August 2026. ' +
      'The listing has been temporarily suspended pending compliance review.',
    effectiveAt: isoFromNow(-2),
    createdAt: isoFromNow(-2),
    ...overrides,
  };
}

/** Minimal document fixture (approved hygiene cert). */
export function makeApprovedDocument(type: string = 'hygiene_cert') {
  return {
    id: `doc-e2e-${type}`,
    vendorId: COMPLIANCE_IDS.vendor,
    documentType: type,
    status: 'approved',
    expiresAt: isoFromNow(180),
    uploadedAt: isoFromNow(-90),
    fileUrl: `https://cdn.feastpot.co.uk/docs/${type}-e2e.pdf`,
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

export interface ComplianceMockOpts {
  /** Enforcement actions returned by GET /vendors/:id/enforcement (client-side). */
  enforcementActions?: unknown[];
  /** Compliance documents returned by GET /vendors/:id/documents (client-side). */
  documents?: unknown[];
  /**
   * Mock response for POST /vendors/:id/images?kind=logo.
   * When set, the upload is intercepted without hitting the real API.
   */
  logoUploadResponse?: { path: string; publicUrl: string };
  /**
   * Mock response for POST /vendors/:id/images?kind=cover.
   * When set, the upload is intercepted without hitting the real API.
   */
  coverUploadResponse?: { path: string; publicUrl: string };
  /**
   * When true, the image upload endpoints return 500 to simulate failure.
   */
  uploadShouldFail?: boolean;
}

/**
 * Install client-side mocks for the Account and compliance screen.
 *
 * Note: the server-side fetches for this page (GET /vendors/me,
 * GET /vendors/:id/verification, GET /terms/versions/me*) use the real
 * API via stored test credentials. Only client-side hook calls and
 * mutations are intercepted here.
 */
export async function installComplianceMocks(
  page: Page,
  opts: ComplianceMockOpts = {},
): Promise<void> {
  const {
    enforcementActions = [],
    documents = [],
    logoUploadResponse,
    coverUploadResponse,
    uploadShouldFail = false,
  } = opts;

  await mockAlways(page, '**/v1/inbox/unread-count', 200, { count: 0 });
  await mockAlways(page, '**/v1/vendor-members/my-role', 200, { role: 'owner' });

  // Enforcement actions (useAccountStatus hook)
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/enforcement(\?.*)?$/, 200, enforcementActions);

  // Compliance documents (useVendorDocuments hook)
  await mockAlways(page, /\/v1\/vendors\/[^/]+\/documents(\?.*)?$/, 200, documents);

  // Terms rate schedule (loaded by TermsClient)
  await mockAlways(page, '**/v1/terms/rate-schedule', 200, [
    { id: 'rs-1', label: 'Your own customers via your link', commissionPercent: 0 },
    { id: 'rs-2', label: 'Repeat marketplace orders', commissionPercent: 10 },
    { id: 'rs-3', label: 'First-time marketplace orders', commissionPercent: 12 },
  ]);

  // Image uploads
  if (uploadShouldFail) {
    await page.route(/\/v1\/vendors\/[^/]+\/images(\?.*)?$/, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"message":"Internal server error"}',
      }),
    );
  } else {
    if (logoUploadResponse) {
      await page.route(/\/v1\/vendors\/[^/]+\/images\?kind=logo/, (route) =>
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(logoUploadResponse),
        }),
      );
    }
    if (coverUploadResponse) {
      await page.route(/\/v1\/vendors\/[^/]+\/images\?kind=cover/, (route) =>
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(coverUploadResponse),
        }),
      );
    }
  }
}
