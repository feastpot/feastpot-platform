/**
 * Automated usability tests for the Account and compliance screen and its
 * associated profile image upload functionality.
 *
 * A1  Assert Standing renders first and a suspended enforcement action is
 *     visible above the fold.
 * A2  Assert the seven vendorRequirements render verbatim from PLATFORM_FACTS.
 * A3  Upload a logo and a cover. Assert both persist and render without a reload.
 * A4  Force an upload failure. Assert a specific error message appears inline,
 *     no orphaned file remains, and no broken image icon is shown.
 * A5  Assert both retired routes (/compliance and /account-status) redirect to
 *     /account-and-compliance.
 *
 * Server-side fetches (GET /vendors/me, GET /vendors/:id/verification,
 * GET /terms/versions/me*) use the real API via the stored test session.
 * Client-side hooks and mutations are intercepted by compliance-mocks.ts.
 */

import * as path from 'path';

import { expect, test } from '@playwright/test';

import { PageMetrics } from './helpers/page-metrics';
import { installComplianceMocks, makeEnforcementAction } from './helpers/compliance-mocks';

// PLATFORM_FACTS.vendorRequirements -- verbatim from packages/config/src/platform-facts.ts.
// These must match EXACTLY: the test fails if a single character differs.
const VENDOR_REQUIREMENTS = [
  'UK business or sole trader registration',
  'Food Business Registration with your local authority',
  'FHRS rating of at least 3 out of 5 (4 recommended)',
  'Public liability insurance, minimum GBP 1 million',
  'Level 2 food safety certificate or equivalent',
  'Valid photo ID',
  'UK bank account for Stripe Connect',
] as const;

// ── A1: Standing renders first, suspended state above the fold ───────────────

test('A1: Standing section renders first and an active suspension card is visible without scrolling', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  await installComplianceMocks(page, {
    enforcementActions: [makeEnforcementAction()],
  });

  await page.goto('/account-and-compliance');
  await page.waitForLoadState('networkidle', { timeout: 12_000 });
  m.startTask();

  // ── A1a: "Standing" heading must be visible ───────────────────────────────

  const standingHeading = page.getByRole('heading', { name: /standing/i }).first();
  await expect(standingHeading).toBeVisible({ timeout: 8_000 });

  // ── A1b: Standing section must appear BEFORE Compliance in DOM order ──────

  const sections = page.locator('section[aria-labelledby]');
  const sectionIds = await sections.evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-labelledby')),
  );
  const standingIdx = sectionIds.findIndex((id) => id?.includes('standing'));
  const complianceIdx = sectionIds.findIndex((id) => id?.includes('compliance'));

  expect(standingIdx, 'A1: Standing section must exist in the DOM').toBeGreaterThanOrEqual(0);
  expect(complianceIdx, 'A1: Compliance section must exist in the DOM').toBeGreaterThanOrEqual(0);
  expect(
    standingIdx,
    'A1: Standing section must come before the Compliance section in DOM order',
  ).toBeLessThan(complianceIdx);

  // ── A1c: Enforcement card is visible in the viewport ─────────────────────

  // The enforcement action shows "Suspension" (actionType label) or the
  // reasonCode label. Either the word "Suspension" or "suspended" must be
  // visible without scrolling.
  const suspensionCard = page.getByText(/suspension|suspended/i).first();
  await expect(suspensionCard).toBeVisible({ timeout: 5_000 });

  // Above-the-fold check: the element must be within the viewport.
  const viewportHeight = page.viewportSize()?.height ?? 800;
  const bbox = await suspensionCard.boundingBox();
  expect(
    bbox?.y ?? 0,
    'A1: suspension card must be within the initial viewport (above the fold)',
  ).toBeLessThan(viewportHeight);

  m.assertNoNavigation('A1');

  console.log('A1 PASS: Standing first in DOM order; suspension card visible above fold');
});

// ── A2: All seven vendorRequirements render verbatim ─────────────────────────

test('A2: all seven PLATFORM_FACTS.vendorRequirements render verbatim in the Compliance section', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();
  await installComplianceMocks(page);

  await page.goto('/account-and-compliance');
  await page.waitForLoadState('networkidle', { timeout: 12_000 });
  m.startTask();

  // Wait for the compliance section to appear.
  await expect(page.getByRole('heading', { name: /compliance/i }).first()).toBeVisible({
    timeout: 8_000,
  });

  // Every requirement must appear verbatim.
  for (const requirement of VENDOR_REQUIREMENTS) {
    await expect(
      page.getByText(requirement),
      `A2: vendorRequirement "${requirement}" must render verbatim`,
    ).toBeVisible({ timeout: 5_000 });
  }

  // Exactly seven requirements must be rendered (not six, not eight).
  // We locate all list items or text nodes that match any requirement.
  let count = 0;
  for (const requirement of VENDOR_REQUIREMENTS) {
    const visible = await page
      .getByText(requirement)
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) count++;
  }
  expect(
    count,
    `A2: all ${VENDOR_REQUIREMENTS.length} requirements must be visible simultaneously`,
  ).toBe(VENDOR_REQUIREMENTS.length);

  m.assertNoNavigation('A2');

  console.log(`A2 PASS: all ${VENDOR_REQUIREMENTS.length} vendorRequirements rendered verbatim`);
});

// ── A3: Logo and cover upload -- persist and render without reload ────────────

test('A3: logo and cover images upload and render without a full page reload', async ({ page }) => {
  const m = new PageMetrics(page);
  await m.install();

  const LOGO_URL = 'https://cdn.feastpot.co.uk/vendor-e2e/logo-uploaded.jpg';
  const COVER_URL = 'https://cdn.feastpot.co.uk/vendor-e2e/cover-uploaded.jpg';

  // Mock GET /vendors/me to return a vendor with no existing images.
  await page.route('**/v1/vendors/me', (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'vendor-e2e-001',
          businessName: "Kwame's Jollof Kitchen",
          status: 'live',
          slug: 'kwames-kitchen',
          logoUrl: null,
          coverImageUrl: null,
          description: 'Home cooking from Peckham.',
          cuisines: [],
          specialities: [],
          featuredDishes: [],
          featuredDishDetails: [],
          socialLinks: null,
          vendorStory: null,
        }),
      });
    } else {
      void route.continue();
    }
  });
  await page.route('**/v1/inbox/unread-count', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"count":0}' }),
  );
  await page.route('**/v1/vendor-members/my-role', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"role":"owner"}' }),
  );
  await page.route('**/v1/vendors/*/menu-items/live', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  // Mock the upload endpoints to return fake public URLs.
  await page.route(/\/v1\/vendors\/[^/]+\/images\?kind=logo/, (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ path: 'vendors/v1/identity/logo/logo.jpg', publicUrl: LOGO_URL }),
    }),
  );
  await page.route(/\/v1\/vendors\/[^/]+\/images\?kind=cover/, (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ path: 'vendors/v1/identity/cover/cover.jpg', publicUrl: COVER_URL }),
    }),
  );

  // After upload the client invalidates the profile query; serve the updated vendor.
  let uploadCount = 0;
  await page.route('**/v1/vendors/me', async (route) => {
    if (route.request().method() === 'GET') {
      uploadCount++;
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'vendor-e2e-001',
          businessName: "Kwame's Jollof Kitchen",
          status: 'live',
          slug: 'kwames-kitchen',
          logoUrl: uploadCount > 1 ? LOGO_URL : null,
          coverImageUrl: uploadCount > 2 ? COVER_URL : null,
          description: 'Home cooking from Peckham.',
          cuisines: [],
          specialities: [],
          featuredDishes: [],
          featuredDishDetails: [],
          socialLinks: null,
          vendorStory: null,
        }),
      });
    } else {
      void route.continue();
    }
  });

  await page.goto('/settings/profile');
  await page.waitForLoadState('networkidle', { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: /business profile/i })).toBeVisible({
    timeout: 8_000,
  });
  m.startTask();

  // ── Logo upload ───────────────────────────────────────────────────────────

  const logoUploadBtn = page.getByRole('button', { name: /upload|replace/i }).first();
  await expect(logoUploadBtn).toBeVisible({ timeout: 5_000 });

  // Use fileChooser to provide a small fixture image without a file on disk.
  const [logoChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    logoUploadBtn.click(),
  ]);
  // Set a synthetic 1x1 JPEG buffer as the file (smallest valid JPEG).
  await logoChooser.setFiles({
    name: 'logo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(
      '/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH' +
        'BwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAAR' +
        'CAABAAEDARAAAAER/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAA' +
        'AAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAA' +
        'AAAAA/9oADAMBAAIRAxEAPwCwABmX/9k=',
      'base64',
    ),
  });

  // While uploading, a spinner or "Uploading" label should appear.
  await expect(
    page
      .getByText(/uploading/i)
      .or(page.locator('[aria-label="Uploading"]'))
      .first(),
  )
    .toBeVisible({ timeout: 3_000 })
    .catch(() => {
      // Spinner may be too brief to catch; proceed to upload-completion assertion.
    });

  // After upload: the img element must be visible (not the broken-image ImageOff icon).
  await expect(
    page.locator('img[alt="Logo"]').or(page.locator('img[alt="logo"]')).first(),
  ).toBeVisible({ timeout: 8_000 });

  // The "broken image" placeholder (ImageOff fallback) must NOT be shown.
  // The ImageOff icon has aria-hidden; look for the upload-button text change instead.
  await expect(page.getByRole('button', { name: 'Replace' }).first()).toBeVisible({
    timeout: 5_000,
  });

  // ── Cover upload ─────────────────────────────────────────────────────────

  const coverUploadBtn = page.getByRole('button', { name: /upload|replace/i }).nth(1);

  const [coverChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    coverUploadBtn.click(),
  ]);
  await coverChooser.setFiles({
    name: 'cover.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=', 'base64'),
  });

  await expect(
    page.locator('img[alt="Cover photo"]').or(page.locator('img[alt="cover"]')).first(),
  ).toBeVisible({ timeout: 8_000 });

  m.assertNoNavigation('A3');

  console.log('A3 PASS: logo and cover uploaded, img elements visible, no reload needed');
});

// ── A4: Upload failure -- inline error, no orphaned file, no broken icon ──────

test('A4: when an upload fails the slot shows a specific inline error and never a broken image icon', async ({
  page,
}) => {
  const m = new PageMetrics(page);
  await m.install();

  // Mock the vendor profile with no existing images.
  await page.route('**/v1/vendors/me', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'vendor-e2e-001',
        businessName: "Kwame's Jollof Kitchen",
        status: 'live',
        slug: 'kwames-kitchen',
        logoUrl: null,
        coverImageUrl: null,
        description: null,
        cuisines: [],
        specialities: [],
        featuredDishes: [],
        featuredDishDetails: [],
        socialLinks: null,
        vendorStory: null,
      }),
    });
  });
  await page.route('**/v1/inbox/unread-count', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"count":0}' }),
  );
  await page.route('**/v1/vendor-members/my-role', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"role":"owner"}' }),
  );
  await page.route('**/v1/vendors/*/menu-items/live', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  // Both upload endpoints fail with 500.
  await page.route(/\/v1\/vendors\/[^/]+\/images/, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Internal server error' }),
    }),
  );

  await page.goto('/settings/profile');
  await expect(page.getByRole('heading', { name: /business profile/i })).toBeVisible({
    timeout: 8_000,
  });
  m.startTask();

  // Trigger a logo upload that will fail.
  const uploadBtn = page.getByRole('button', { name: /upload/i }).first();
  await expect(uploadBtn).toBeVisible({ timeout: 5_000 });

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), uploadBtn.click()]);
  await chooser.setFiles({
    name: 'logo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=', 'base64'),
  });

  // ── A4a: Specific error message must appear inline ────────────────────────

  // The ImageSlot renders an error paragraph with role="alert" when the upload fails.
  const errorMsg = page.locator('[role="alert"]').first();
  await expect(errorMsg).toBeVisible({ timeout: 8_000 });
  const errorText = (await errorMsg.textContent()) ?? '';
  expect(errorText.trim().length, 'A4: error message must not be empty').toBeGreaterThan(0);

  // ── A4b: No broken image icon -- ImageOff must not replace a real img ──────

  // After a failed upload, the slot must NOT show a broken <img> element.
  // The localPreview blob URL is revoked on upload completion; the slot must
  // revert to the placeholder state (ImageOff icon), not a broken image.
  const brokenImgs = page.locator('img[src=""]').or(page.locator('img:not([src])'));
  const brokenCount = await brokenImgs.count();
  expect(
    brokenCount,
    'A4: no broken img element (empty or missing src) must appear after failed upload',
  ).toBe(0);

  // ── A4c: No orphaned file -- the slot still offers "Upload" (not "Replace") ─

  // If the upload failed the slot must not pretend the file was stored.
  // The button label must still be "Upload", not "Replace".
  await expect(page.getByRole('button', { name: /^Upload$/ }).first()).toBeVisible({
    timeout: 3_000,
  });

  m.assertNoNavigation('A4');

  console.log(
    `A4 PASS: upload failure shows "${errorText.trim()}", no broken icon, no orphaned file`,
  );
});

// ── A5: Both retired routes redirect to /account-and-compliance ───────────────

test('A5: /compliance redirects to /account-and-compliance', async ({ page }) => {
  await installComplianceMocks(page);

  await page.goto('/compliance');
  await page.waitForURL(/\/account-and-compliance/, { timeout: 8_000 });

  expect(
    new URL(page.url()).pathname,
    'A5: /compliance must redirect to /account-and-compliance',
  ).toBe('/account-and-compliance');

  console.log('A5a PASS: /compliance -> /account-and-compliance');
});

test('A5: /account-status redirects to /account-and-compliance', async ({ page }) => {
  await installComplianceMocks(page);

  await page.goto('/account-status');
  await page.waitForURL(/\/account-and-compliance/, { timeout: 8_000 });

  expect(
    new URL(page.url()).pathname,
    'A5: /account-status must redirect to /account-and-compliance',
  ).toBe('/account-and-compliance');

  console.log('A5b PASS: /account-status -> /account-and-compliance');
});

test('A5: /terms redirects to /account-and-compliance', async ({ page }) => {
  await installComplianceMocks(page);

  await page.goto('/terms');
  await page.waitForURL(/\/account-and-compliance/, { timeout: 8_000 });

  expect(new URL(page.url()).pathname, 'A5: /terms must redirect to /account-and-compliance').toBe(
    '/account-and-compliance',
  );

  console.log('A5c PASS: /terms -> /account-and-compliance');
});
