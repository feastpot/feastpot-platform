import { existsSync, readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
  matrixManifestPath,
  matrixNamespace,
  matrixStorageStatePath,
  type VendorStateMatrixManifest,
} from './helpers/vendor-state-matrix';

function manifest(): VendorStateMatrixManifest {
  const path = matrixManifestPath(matrixNamespace());
  if (!existsSync(path)) {
    throw new Error(
      `Vendor fixture manifest is missing at ${path}. Run the matrix setup project first.`,
    );
  }
  return JSON.parse(readFileSync(path, 'utf8')) as VendorStateMatrixManifest;
}

/**
 * Supabase persists its browser session under a project-specific localStorage
 * key.  Read the token rather than minting one in the test: this proves the
 * request has precisely the permissions of the real factory V5 vendor.
 */
async function factoryAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.includes('auth-token')) continue;
      try {
        const session = JSON.parse(localStorage.getItem(key) ?? '{}') as {
          access_token?: string;
        };
        if (session.access_token) return session.access_token;
      } catch {
        // Ignore unrelated malformed application storage.
      }
    }
    return null;
  });
  if (!token) throw new Error('Factory V5 session has no browser access token.');
  return token;
}

test.describe('factory vendor authorization contracts', () => {
  test.use({ storageState: matrixStorageStatePath('V5') });

  test('V5 cannot mutate V9 menu item: API returns 403', async ({ page }) => {
    const identities = manifest().identities;
    const target = identities.V9;
    if (!target.vendorId || !target.menuId || !target.menuItemId) {
      throw new Error('V9 fixture did not provide a vendor and menu item identity.');
    }

    // Load the portal first so the authenticated browser storage is available;
    // no browser route is intercepted in this test.
    await page.goto('/menu', { waitUntil: 'domcontentloaded' });
    const token = await factoryAccessToken(page);
    const apiUrl = process.env.TEST_API_URL ?? 'http://localhost:3001';
    const status = await page.evaluate(
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
        return response.status;
      },
      {
        url: apiUrl,
        accessToken: token,
        vendorId: target.vendorId,
        menuId: target.menuId,
        itemId: target.menuItemId,
      },
    );

    expect(status).toBe(403);
  });
});
