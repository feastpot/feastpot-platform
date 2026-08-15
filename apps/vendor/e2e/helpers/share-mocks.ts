/**
 * API mock helpers for the Share and Customers screen e2e suite.
 *
 * The canonical referral URL lives on VendorReferralLink.referralUrl.
 * Tests use CANONICAL_REFERRAL_URL to assert the share page displays
 * the correct link -- never a vendor-slug URL with ?src=vendor appended
 * directly onto the vendor profile path.
 */
import type { Page } from '@playwright/test';

export const SHARE_IDS = {
  vendor: 'vendor-e2e-001',
  referralLink: 'rl-e2e-001',
} as const;

// Canonical referral URL served through /v/[slug] on the customer app.
// The referral link slug is NOT the same as the vendor profile slug.
export const CANONICAL_REFERRAL_URL = 'https://feastpot.co.uk/v/kwames-kitchen-abc123';
export const CANONICAL_REFERRAL_SLUG = 'kwames-kitchen-abc123';

export function makeReferralLink(overrides: Record<string, unknown> = {}) {
  return {
    id: SHARE_IDS.referralLink,
    slug: CANONICAL_REFERRAL_SLUG,
    referralUrl: CANONICAL_REFERRAL_URL,
    qrUrls: {
      png: `https://cdn.feastpot.co.uk/qr/${CANONICAL_REFERRAL_SLUG}.png`,
      svg: `https://cdn.feastpot.co.uk/qr/${CANONICAL_REFERRAL_SLUG}.svg`,
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeCustomerSplit() {
  return {
    thisWeek: {
      VENDOR_REFERRED: { orders: 7, gmvPence: 18_000 },
      MARKETPLACE: { orders: 3, gmvPence: 8_400 },
    },
    cumulative: {
      VENDOR_REFERRED: { orders: 54, gmvPence: 134_500 },
      MARKETPLACE: { orders: 21, gmvPence: 52_800 },
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

export async function installShareMocks(
  page: Page,
  linkOverrides: Record<string, unknown> = {},
): Promise<void> {
  await mockAlways(page, '**/v1/vendors/me', 200, {
    id: SHARE_IDS.vendor,
    businessName: "Kwame's Jollof Kitchen",
    status: 'live',
  });
  await mockAlways(page, '**/v1/inbox/unread-count', 200, { count: 0 });
  await mockAlways(page, '**/v1/vendor-members/my-role', 200, { role: 'owner' });

  await mockAlways(
    page,
    /\/v1\/vendors\/[^/]+\/referral-link(\?.*)?$/,
    200,
    makeReferralLink(linkOverrides),
  );
  await mockAlways(
    page,
    /\/v1\/vendors\/[^/]+\/customers\/split(\?.*)?$/,
    200,
    makeCustomerSplit(),
  );
  await mockAlways(page, '**/v1/attribution/clicks', 200, {
    referralLinkId: SHARE_IDS.referralLink,
    clickId: 'click-e2e-001',
  });
}
