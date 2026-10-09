/**
 * Data-only SLA fixtures with genuine AAL2 authentication. A fixed midweek
 * clock verifies the current one-business-day policy without weekend flakiness.
 */
import { expect, test } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3003';
const NOW = Date.parse('2026-10-07T12:00:00Z');

const makeEnquiry = (id: string, hours: number) => ({
  id,
  occasionType: 'Birthday',
  guestCountBand: '50-100',
  cuisineStyle: 'Nigerian',
  postcode: 'SE15 4EE',
  outwardCode: 'SE15',
  eventDate: null,
  preferredTime: null,
  budgetBand: null,
  contactName: `Test User ${id}`,
  email: `${id}@example.com`,
  phone: null,
  notes: null,
  hearAboutUs: null,
  status: 'NEW',
  adminNotes: null,
  source: null,
  isTestData: false,
  provenance: null,
  createdAt: new Date(NOW - hours * 60 * 60 * 1000).toISOString(),
  booking: null,
});

async function setupAndNavigate(page: import('@playwright/test').Page, enquiries: object[]) {
  await page.clock.setFixedTime(NOW);
  await page.route('**/v1/catering-enquiries**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: enquiries, nextCursor: null }),
    }),
  );
  await page.goto(`${BASE}/catering?tab=enquiries`);
  await expect(page).toHaveURL(`${BASE}/catering?tab=enquiries`);
  await expect(page.locator('aside[aria-label="Admin console navigation"]')).toBeVisible();
}

test('SLA-1: 6h enquiry shows neutral SLA badge with deadline label', async ({ page }) => {
  await setupAndNavigate(page, [makeEnquiry('enq-001', 6)]);
  const pill = page.getByTestId('sla-pill');
  await expect(pill).toHaveAttribute('data-tone', 'neutral');
  await expect(pill).toHaveText('Due in 18h');
});

test('SLA-2: 18h enquiry shows amber SLA badge with deadline label', async ({ page }) => {
  await setupAndNavigate(page, [makeEnquiry('enq-002', 18)]);
  const pill = page.getByTestId('sla-pill');
  await expect(pill).toHaveAttribute('data-tone', 'amber');
  await expect(pill).toHaveText('Due in 6h');
});

test('SLA-3: 36h enquiry shows red SLA badge with overdue label', async ({ page }) => {
  await setupAndNavigate(page, [makeEnquiry('enq-003', 36)]);
  const pill = page.getByTestId('sla-pill');
  await expect(pill).toHaveAttribute('data-tone', 'red');
  await expect(pill).toHaveText('Overdue by 12h');
});

test('SLA-4: mixed-age enquiries sort most-urgent (overdue) first', async ({ page }) => {
  await setupAndNavigate(page, [
    makeEnquiry('enq-a', 6),
    makeEnquiry('enq-b', 18),
    makeEnquiry('enq-c', 36),
  ]);
  const firstPill = page.locator('tbody tr').first().getByTestId('sla-pill');
  await expect(firstPill).toHaveText('Overdue by 12h');
  await expect(firstPill).toHaveAttribute('data-tone', 'red');
});
