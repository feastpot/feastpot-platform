import { expect, test, type Page } from '@playwright/test';

import { TestDataFactory, type TestIdentity } from '../../../scripts/test-factory';
import { browserAccessToken } from './helpers/browser-access-token';

import { matrixNamespace, matrixStorageStatePath } from './helpers/vendor-state-matrix';

/**
 * Supabase SSR persists the browser session in project-specific cookies.
 * Read the token rather than minting one in the test: this proves the
 * request has precisely the permissions of the real factory V5 vendor.
 */
async function factoryAccessToken(page: Page): Promise<string> {
  return browserAccessToken(page);
}

test.describe('factory vendor authorization contracts', () => {
  test.use({ storageState: matrixStorageStatePath('V5') });

  test('V5 cannot mutate another vendor menu item: API returns 403', async ({ page }) => {
    test.setTimeout(120_000);
    // Canonical V9 intentionally has no terms acceptance, so its terms guard
    // returns 400 before ownership is checked. Use a separately owned, eligible
    // target without changing the matrix's V9 contract or any product guard.
    const factory = TestDataFactory.fromEnvironment({
      namespace: `${matrixNamespace()}-authorization-target`,
    });
    let target: TestIdentity | undefined;
    try {
      target = await factory.createPurchaseVendor();
      if (!target.vendorId || !target.menuId || !target.menuItemId) {
        throw new Error('Authorization target did not provide a vendor and menu item identity.');
      }
      const before = await factory.prisma.menuItem.findUniqueOrThrow({
        where: { id: target.menuItemId },
      });

      // Load the portal first so the authenticated browser storage is available;
      // no browser route is intercepted in this test.
      await page.goto('/menu', { waitUntil: 'domcontentloaded' });
      const token = await factoryAccessToken(page);
      const apiUrl = process.env.TEST_API_URL ?? 'http://localhost:3001';
      const result = await page.evaluate(
        async ({ url, accessToken, vendorId, menuId, itemId }) => {
          const response = await fetch(
            `${url}/v1/vendors/${vendorId}/menus/${menuId}/items/${itemId}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ name: 'Unauthorized test mutation' }),
            },
          );
          return { status: response.status, body: await response.json() };
        },
        {
          url: apiUrl,
          accessToken: token,
          vendorId: target.vendorId,
          menuId: target.menuId,
          itemId: target.menuItemId,
        },
      );

      expect(result.status, JSON.stringify(result.body)).toBe(403);
      expect(result.body).toMatchObject({ code: 'NOT_VENDOR_OWNER' });
      expect(
        await factory.prisma.menuItem.findUniqueOrThrow({
          where: { id: target.menuItemId },
        }),
      ).toEqual(before);
    } finally {
      try {
        if (target) await factory.teardown(target);
      } finally {
        await factory.dispose();
      }
    }
  });
});
