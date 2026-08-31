/**
 * Empty-vendor coverage for the canonical replacements of retired vendor routes.
 * All browser API calls are intercepted with valid zero-data responses; no
 * external API credentials are used by the test fixtures themselves.
 */
import { expect, test } from '@playwright/test';

import { installComplianceMocks } from './helpers/compliance-mocks';
import { installPerformanceMocks } from './helpers/performance-mocks';
import { CANONICAL_REFERRAL_URL, installShareMocks } from './helpers/share-mocks';

const ERROR_BOUNDARY_COPY = /application error|something went wrong|error digest/i;

test('EV1: retired earnings destination renders the empty Performance state without an error boundary', async ({
  page,
}) => {
  await installPerformanceMocks(page, { empty: true });

  await page.goto('/earnings');
  await page.waitForURL(/\/performance$/, { timeout: 8_000 });

  await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText('No completed orders yet')).toBeVisible();
  await expect(page.getByText('No completed orders this month yet.')).toBeVisible();
  await expect(page.getByText(ERROR_BOUNDARY_COPY)).toBeHidden();
});

test('EV2: account and compliance renders no restrictions and the empty compliance checklist', async ({
  page,
}) => {
  await installComplianceMocks(page, { enforcementActions: [], documents: [] });

  await page.goto('/account-and-compliance');

  await expect(page.getByRole('heading', { name: 'Account and compliance' })).toBeVisible({
    timeout: 8_000,
  });
  await expect(page.getByRole('heading', { name: 'Standing' })).toBeVisible();
  await expect(page.getByText('No restrictions on your account')).toBeVisible();
  await expect(page.getByText(/clause 14\.1.*clause 18\.1/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Compliance', exact: true })).toBeVisible();
  await expect(page.getByText('Not started').first()).toBeVisible();
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test('EV3: share keeps its QR and download controls while order-source data is zero', async ({
  page,
}) => {
  await installShareMocks(page, {}, { empty: true });

  await page.goto('/share');

  await expect(page.getByText(CANONICAL_REFERRAL_URL, { exact: true })).toBeVisible({
    timeout: 8_000,
  });
  await expect(
    page.getByRole('img', { name: `QR code for ${CANONICAL_REFERRAL_URL}` }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download PNG' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download SVG' })).toBeVisible();
  await expect(
    page.getByText(/No orders yet\. Marketplace orders come from Feastpot discovery/i),
  ).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Order source breakdown placeholder' }),
  ).toContainText('£0.00');
  await expect(
    page.getByRole('table', { name: 'Order source breakdown placeholder' }),
  ).toContainText('Marketplace');
  await expect(
    page.getByRole('table', { name: 'Order source breakdown placeholder' }),
  ).toContainText('Your referral');
});

test('EV4: new catering quote desktop shell exposes its breadcrumb and Cancel destination', async ({
  page,
}) => {
  await installPerformanceMocks(page);

  await page.goto('/catering/new');

  await expect(page.getByRole('heading', { name: 'New catering quote' })).toBeVisible({
    timeout: 8_000,
  });
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb.getByRole('link', { name: 'Catering bookings' })).toHaveAttribute(
    'href',
    '/catering',
  );
  await expect(page.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/catering');
  await expect(page.getByRole('heading', { name: 'No catering enquiry selected' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save quote' })).toHaveCount(0);
});

test('EV5: new catering quote shell has no horizontal document overflow at 375px', async ({
  page,
}) => {
  await installPerformanceMocks(page);

  await page.goto('/catering/new');
  await expect(page.getByRole('heading', { name: 'New catering quote' })).toBeVisible({
    timeout: 8_000,
  });

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    'EV5: the 375px catering shell must not overflow horizontally',
  ).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('EV6: referral API failure is not presented as an endless preparation state', async ({
  page,
}) => {
  await installShareMocks(page, {}, { linkStatus: 500 });

  await page.goto('/share');

  await expect(page.getByText('Could not load your referral link')).toBeVisible({
    timeout: 8_000,
  });
  await expect(page.getByText('Preparing your referral link')).toHaveCount(0);
});
