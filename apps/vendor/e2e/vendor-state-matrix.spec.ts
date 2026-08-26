import { existsSync, readFileSync } from 'node:fs';

import { expect, test, type BrowserContext } from '@playwright/test';

import {
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

  for (let index = 0; index < VENDOR_PORTAL_ROUTES.length; index += ROUTE_CHECK_CONCURRENCY) {
    await Promise.all(
      VENDOR_PORTAL_ROUTES.slice(index, index + ROUTE_CHECK_CONCURRENCY).map((route) =>
        visitRoute(context, state, route, mobile),
      ),
    );
  }
}

for (const state of VENDOR_MATRIX_STATES) {
  test.describe(`${state} vendor state`, () => {
    test.use({ storageState: matrixStorageStatePath(state) });

    test(`${state} routes render their safe state without an error boundary`, async ({
      context,
    }) => {
      await visitEveryRoute(context, state);
    });
  });
}

test.describe('V4 mobile route safety', () => {
  test.use({ storageState: matrixStorageStatePath('V4') });

  test('V4 routes do not overflow horizontally at 375px', async ({ context }) => {
    await visitEveryRoute(context, 'V4', true);
  });
});
