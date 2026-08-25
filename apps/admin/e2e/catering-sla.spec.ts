/**
 * Catering enquiry SLA pill state tests.
 *
 * Verifies that the Enquiries tab renders the correct SLA pill tone and
 * label for enquiries at three ages:
 *   12 h  → neutral pill  ("12h ago")
 *   36 h  → amber pill    ("36h ago")
 *   60 h  → red pill      ("Overdue by 12h")
 *
 * The catering-enquiries API and Supabase session are mocked via
 * page.route() so tests do not require real credentials. If the
 * middleware redirects to sign-in before our mocks are applied (i.e.
 * the SSR auth check sees no session cookie), each test skips
 * automatically with an explanatory message.
 *
 * Run:
 *   npx playwright test --config apps/admin/playwright.config.ts e2e/catering-sla.spec.ts
 */

import { expect, test } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3003';

// Fake admin user returned by mocked Supabase auth endpoints.
const FAKE_ADMIN = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  email: 'admin@feastpot.co.uk',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
};

type MakeEnquiry = (overrides: {
  id: string;
  createdAtOffset: number;
  eventDate?: string;
}) => object;

const makeEnquiry: MakeEnquiry = ({ id, createdAtOffset, eventDate }) => ({
  id,
  occasionType: 'Birthday',
  guestCountBand: '50-100',
  cuisineStyle: 'Nigerian',
  postcode: 'SE15 4EE',
  outwardCode: 'SE15',
  eventDate: eventDate ?? null,
  preferredTime: null,
  budgetBand: null,
  contactName: `Test User ${id.slice(-3)}`,
  email: `test-${id.slice(-3)}@example.com`,
  phone: null,
  notes: null,
  hearAboutUs: null,
  status: 'NEW',
  adminNotes: null,
  source: null,
  createdAt: new Date(Date.now() - createdAtOffset).toISOString(),
  booking: null,
});

/**
 * Set up route mocks and navigate to /catering?tab=enquiries.
 * Returns whether the page was successfully loaded (false = redirected to sign-in).
 */
async function setupAndNavigate(
  page: Parameters<Parameters<typeof test>[1]>[0],
  enquiries: object[],
): Promise<boolean> {
  // Mock Supabase session/user endpoints so SSR auth sees a valid admin.
  await page.route('**/auth/v1/user**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FAKE_ADMIN),
    }),
  );
  await page.route('**/auth/v1/session**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-token',
        refresh_token: 'fake-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: FAKE_ADMIN,
      }),
    }),
  );

  // Mock the catering enquiries API with seeded fixtures.
  await page.route('**/v1/catering-enquiries**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: enquiries, nextCursor: null }),
    }),
  );

  // Mock the admin user lookup (role check).
  await page.route('**/v1/admin/me**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: FAKE_ADMIN.id, email: FAKE_ADMIN.email, role: 'admin' }),
    }),
  );

  await page.goto(`${BASE}/catering?tab=enquiries`);
  await page.waitForLoadState('domcontentloaded');

  // If SSR auth check wasn't satisfied by the mock, we end up at sign-in.
  if (page.url().includes('/sign-in') || page.url().includes('/unauthorized')) {
    return false;
  }
  return true;
}

// ── SLA-1: 12 h enquiry → neutral pill ─────────────────────────────────────

test('SLA-1: 12h enquiry shows neutral SLA pill with age label', async ({ page }) => {
  const H12 = 12 * 60 * 60 * 1000;
  const enquiries = [makeEnquiry({ id: 'enq-001', createdAtOffset: H12 })];

  const loaded = await setupAndNavigate(page, enquiries);
  if (!loaded) {
    test.skip(true, 'SSR auth not satisfied by mock -- run with real session to enable SLA tests');
    return;
  }

  const pill = page.locator('[data-testid="sla-pill"][data-tone="neutral"]').first();
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await expect(pill).toContainText('ago');
  console.log('[SLA-1] neutral pill text:', await pill.textContent());
});

// ── SLA-2: 36 h enquiry → amber pill ───────────────────────────────────────

test('SLA-2: 36h enquiry shows amber SLA pill with age label', async ({ page }) => {
  const H36 = 36 * 60 * 60 * 1000;
  const enquiries = [makeEnquiry({ id: 'enq-002', createdAtOffset: H36 })];

  const loaded = await setupAndNavigate(page, enquiries);
  if (!loaded) {
    test.skip(true, 'SSR auth not satisfied by mock -- run with real session to enable SLA tests');
    return;
  }

  const pill = page.locator('[data-testid="sla-pill"][data-tone="amber"]').first();
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await expect(pill).toContainText('ago');
  console.log('[SLA-2] amber pill text:', await pill.textContent());
});

// ── SLA-3: 60 h enquiry → red pill "Overdue by 12h" ───────────────────────

test('SLA-3: 60h enquiry shows red SLA pill with "Overdue by Nh" label', async ({ page }) => {
  const H60 = 60 * 60 * 60 * 1000;
  const enquiries = [makeEnquiry({ id: 'enq-003', createdAtOffset: H60 })];

  const loaded = await setupAndNavigate(page, enquiries);
  if (!loaded) {
    test.skip(true, 'SSR auth not satisfied by mock -- run with real session to enable SLA tests');
    return;
  }

  const pill = page.locator('[data-testid="sla-pill"][data-tone="red"]').first();
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await expect(pill).toContainText('Overdue by');
  console.log('[SLA-3] red pill text:', await pill.textContent());
});

// ── SLA-4: All three in one load, sorted most-urgent first ─────────────────

test('SLA-4: mixed-age enquiries sort most-urgent (overdue) first', async ({ page }) => {
  const H12 = 12 * 60 * 60 * 1000;
  const H36 = 36 * 60 * 60 * 1000;
  const H60 = 60 * 60 * 60 * 1000;
  // Deliberately provide in reverse urgency order (neutral first, overdue last).
  const enquiries = [
    makeEnquiry({ id: 'enq-a', createdAtOffset: H12 }), // neutral
    makeEnquiry({ id: 'enq-b', createdAtOffset: H36 }), // amber
    makeEnquiry({ id: 'enq-c', createdAtOffset: H60 }), // red / overdue
  ];

  const loaded = await setupAndNavigate(page, enquiries);
  if (!loaded) {
    test.skip(true, 'SSR auth not satisfied by mock -- run with real session to enable SLA tests');
    return;
  }

  // Wait for any SLA pill to appear.
  await expect(page.locator('[data-testid="sla-pill"]').first()).toBeVisible({ timeout: 10_000 });

  // The first pill in DOM order should be the red/overdue one.
  const firstPill = page.locator('[data-testid="sla-pill"]').first();
  const tone = await firstPill.getAttribute('data-tone');
  expect(tone).toBe('red');
  console.log('[SLA-4] first pill tone:', tone);
});
