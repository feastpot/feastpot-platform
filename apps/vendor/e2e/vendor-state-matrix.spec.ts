import { existsSync, readFileSync } from 'node:fs';

import { expect, test, type BrowserContext } from '@playwright/test';

import {
  configuredMatrixStates,
  matrixBusinessName,
  matrixManifestPath,
  matrixNamespace,
  matrixStorageStatePath,
  type VendorMatrixState,
  type VendorStateMatrixManifest,
  VENDOR_MATRIX_STATES,
  VENDOR_PORTAL_ROUTES,
} from './helpers/vendor-state-matrix';

const ERROR_BOUNDARY_COPY =
  /something went wrong|we hit an unexpected error|application error|error digest|internal server error/i;
const ROUTE_CHECK_CONCURRENCY = 4;

const STATE_LANDMARKS: Record<
  VendorMatrixState,
  ReadonlyArray<{ href: string; text: string | RegExp }>
> = {
  V4: [
    { href: '/menu', text: 'No dishes yet' },
    { href: '/performance', text: 'No completed orders yet' },
    { href: '/account-and-compliance', text: 'No restrictions on your account' },
    { href: '/account-and-compliance', text: 'Not started' },
    { href: '/share', text: 'Order source breakdown' },
    { href: '/catering/new', text: 'No catering enquiry selected' },
  ],
  V5: [
    { href: '/orders', text: /Completed\s*1/ },
    { href: '/payouts', text: /payout/i },
  ],
  V6: [{ href: '/account-and-compliance', text: /expir(?:es|ing)/i }],
  V7: [{ href: '/account-and-compliance', text: /expired|suspended/i }],
  V8: [{ href: '/account-and-compliance', text: /FHRS hygiene rating below threshold/i }],
};

function readManifest(): VendorStateMatrixManifest {
  const manifestPath = matrixManifestPath(matrixNamespace());
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Vendor state matrix fixture manifest is missing at ${manifestPath}. ` +
        'Run the vendor-state-matrix setup project before this suite.',
    );
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as VendorStateMatrixManifest;
}

async function assertNoErrorBoundary(pageText: string, route: string): Promise<void> {
  expect(pageText, `${route} must not show a generic vendor error boundary`).not.toMatch(
    ERROR_BOUNDARY_COPY,
  );
}

async function visitRoute(
  context: BrowserContext,
  state: VendorMatrixState,
  route: (typeof VENDOR_PORTAL_ROUTES)[number],
  mobile = false,
) {
  const page = await context.newPage();
  const identity = readManifest().identities[state];
  const businessName = matrixBusinessName(state);

  try {
    await test.step(`${state}${mobile ? ' mobile' : ''}: ${route.label}`, async () => {
      await page.goto(route.href(identity), {
        timeout: 60_000,
        waitUntil: 'domcontentloaded',
      });

      await page.waitForTimeout(1_000);

      const pageText = (await page.locator('body').textContent()) ?? '';
      await assertNoErrorBoundary(pageText, route.label);

      if (route.expectsPortalShell && !mobile) {
        const sideNav = page.locator('aside[aria-label="Vendor portal navigation"]');
        await expect(sideNav, `${route.label} must retain portal navigation`).toBeVisible({
          timeout: 10_000,
        });
        await expect(
          sideNav,
          `${route.label} must show the actual trading name for ${state}`,
        ).toContainText(businessName);
      }

      if (mobile) {
        const dimensions = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(
          dimensions.scrollWidth,
          `${route.label} must not overflow horizontally at 375px`,
        ).toBeLessThanOrEqual(dimensions.clientWidth);
      }
    });
  } finally {
    await page.close();
  }
}

async function visitEveryRoute(context: BrowserContext, state: VendorMatrixState, mobile = false) {
  test.setTimeout(10 * 60_000);
  const concurrency = mobile ? 1 : ROUTE_CHECK_CONCURRENCY;

  for (let index = 0; index < VENDOR_PORTAL_ROUTES.length; index += concurrency) {
    await Promise.all(
      VENDOR_PORTAL_ROUTES.slice(index, index + concurrency).map((route) =>
        visitRoute(context, state, route, mobile),
      ),
    );
  }
}

async function assertStateLandmarks(context: BrowserContext, state: VendorMatrixState) {
  const page = await context.newPage();
  try {
    for (const landmark of STATE_LANDMARKS[state]) {
      await test.step(`${state}: ${landmark.href} shows its expected state`, async () => {
        await page.goto(landmark.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await expect(page.locator('main')).toContainText(landmark.text, { timeout: 10_000 });
        const pageText = (await page.locator('body').textContent()) ?? '';
        await assertNoErrorBoundary(pageText, landmark.href);
      });
    }
  } finally {
    await page.close();
  }
}

for (const state of configuredMatrixStates()) {
  test.describe(`${state} vendor state`, () => {
    test.use({ storageState: matrixStorageStatePath(state) });

    test(`${state} routes render their safe state without an error boundary`, async ({
      context,
    }) => {
      await visitEveryRoute(context, state);
      await assertStateLandmarks(context, state);
    });
  });
}

test.describe('V4 mobile route safety', () => {
  test.use({ storageState: matrixStorageStatePath('V4') });

  test('V4 routes do not overflow horizontally at 375px', async ({ context }) => {
    await visitEveryRoute(context, 'V4', true);
  });
});
