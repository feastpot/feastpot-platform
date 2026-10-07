/**
 * Catering enquiry SLA pill state tests.
 *
 * Verifies the consolidated Enquiries tab's one-business-day SLA:
 *   6 h  → neutral badge ("Due in 18h")
 *   18 h → amber badge   ("Due in 6h")
 *   36 h → red badge     ("Overdue by 12h")
 *
 * Only enquiry data is intercepted. Authentication uses the genuine AAL2
 * setup session. A fixed midweek clock makes business-day ageing independent
 * of the runner's current day and timezone.
 *
 * Run:
 *   npx playwright test --config apps/admin/playwright.config.ts e2e/catering-sla.spec.ts
 */

import { expect, test } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3003';

const NOW = Date.parse('2026-10-07T12:00:00Z');

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
  isTestData: false,
  provenance: null,
  createdAt: new Date(NOW - createdAtOffset).toISOString(),
  booking: null,
});

/**
 * Set up route mocks and navigate to /catering?tab=enquiries.
 * Preserve real authentication; fail rather than skip when it is absent.
 */
async function setupAndNavigate(
  page: Parameters<Parameters<typeof test>[1]>[0],
  enquiries: object[],
): Promise<void> {
  await page.clock.setFixedTime(NOW);

  // Mock the catering enquiries API with seeded fixtures.
  await page.route('**/v1/catering-enquiries**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: enquiries, nextCursor: null }),
    }),
  );

  await page.goto(`${BASE}/catering?tab=enquiries`);
  await page.waitForLoadState('domcontentloaded');

  await expect(page).toHaveURL(`${BASE}/catering?tab=enquiries`);
  await expect(page.locator('aside[aria-label="Admin console navigation"]')).toBeVisible();
}

// ── SLA-1: 6 h enquiry → neutral badge ────────────────────────────────────

test('SLA-1: 6h enquiry shows neutral SLA badge with deadline label', async ({ page }) => {
  const H6 = 6 * 60 * 60 * 1000;
  const enquiries = [makeEnquiry({ id: 'enq-001', createdAtOffset: H6 })];
  await setupAndNavigate(page, enquiries);
  const pill = page.locator('[data-testid="sla-pill"][data-tone="neutral"]');
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await expect(pill).toHaveText('Due in 18h');
  console.log('[SLA-1] neutral pill text:', await pill.textContent());
});

// ── SLA-2: 18 h enquiry → amber badge ──────────────────────────────────────

test('SLA-2: 18h enquiry shows amber SLA badge with deadline label', async ({ page }) => {
  const H18 = 18 * 60 * 60 * 1000;
  const enquiries = [makeEnquiry({ id: 'enq-002', createdAtOffset: H18 })];
  await setupAndNavigate(page, enquiries);
  const pill = page.locator('[data-testid="sla-pill"][data-tone="amber"]');
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await expect(pill).toHaveText('Due in 6h');
  console.log('[SLA-2] amber pill text:', await pill.textContent());
});

// ── SLA-3: 36 h enquiry → red badge "Overdue by 12h" ───────────────────────

test('SLA-3: 36h enquiry shows red SLA badge with overdue label', async ({ page }) => {
  const H36 = 36 * 60 * 60 * 1000;
  const enquiries = [makeEnquiry({ id: 'enq-003', createdAtOffset: H36 })];
  await setupAndNavigate(page, enquiries);
  const pill = page.locator('[data-testid="sla-pill"][data-tone="red"]');
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await expect(pill).toHaveText('Overdue by 12h');
  console.log('[SLA-3] red pill text:', await pill.textContent());
});

// ── SLA-4: All three in one load, sorted most-urgent first ─────────────────

test('SLA-4: mixed-age enquiries sort most-urgent (overdue) first', async ({ page }) => {
  const H6 = 6 * 60 * 60 * 1000;
  const H18 = 18 * 60 * 60 * 1000;
  const H36 = 36 * 60 * 60 * 1000;
  // Deliberately provide in reverse urgency order (neutral first, overdue last).
  const enquiries = [
    makeEnquiry({ id: 'enq-a', createdAtOffset: H6 }), // neutral
    makeEnquiry({ id: 'enq-b', createdAtOffset: H18 }), // amber
    makeEnquiry({ id: 'enq-c', createdAtOffset: H36 }), // red / overdue
  ];

  await setupAndNavigate(page, enquiries);
  // The first enquiry row must be the red/overdue one, not merely contain
  // some overdue badge elsewhere in the table.
  const firstPill = page.locator('tbody tr').first().getByTestId('sla-pill');
  await expect(firstPill).toHaveText('Overdue by 12h', { timeout: 10_000 });
  await expect(firstPill).toHaveAttribute('data-tone', 'red');
});
