import { existsSync, readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { TestDataFactory } from '../../../scripts/test-factory';

import {
  matrixManifestPath,
  matrixNamespace,
  matrixStorageStatePath,
  type VendorStateMatrixManifest,
} from './helpers/vendor-state-matrix';

function manifest(): VendorStateMatrixManifest {
  const path = matrixManifestPath(matrixNamespace());
  if (!existsSync(path)) throw new Error(`Vendor fixture manifest is missing at ${path}.`);
  return JSON.parse(readFileSync(path, 'utf8')) as VendorStateMatrixManifest;
}

async function token(page: Page): Promise<string> {
  const accessToken = await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.includes('auth-token')) continue;
      const session = JSON.parse(localStorage.getItem(key) ?? '{}') as { access_token?: string };
      if (session.access_token) return session.access_token;
    }
    return null;
  });
  if (!accessToken) throw new Error('Factory V5 browser session has no access token.');
  return accessToken;
}

test.describe.serial('factory-backed vendor menu contracts', () => {
  test.use({ storageState: matrixStorageStatePath('V5') });

  let factory: TestDataFactory;
  let vendorId: string;
  let menuId: string;
  let itemId: string;

  test.beforeAll(async () => {
    const v5 = manifest().identities.V5;
    if (!v5.vendorId || !v5.menuId) throw new Error('V5 fixture lacks vendor/menu identity.');
    vendorId = v5.vendorId;
    menuId = v5.menuId;
    factory = TestDataFactory.fromEnvironment({ namespace: `${matrixNamespace()}-menu-contracts` });
    itemId = (
      await factory.prisma.menuItem.create({
        data: {
          vendorId,
          menuId,
          name: 'Factory menu contract dish',
          description: 'Temporary live dish used by vendor menu API checks.',
          category: 'mains',
          pricePence: 1500,
          imageUrls: [],
          allergens: ['milk'],
          allergensFreeFrom: false,
          tags: ['test-fixture'],
          isAvailable: true,
        },
      })
    ).id;
  });

  test.afterAll(async () => {
    try {
      if (itemId) await factory.prisma.menuItem.delete({ where: { id: itemId } });
    } finally {
      await factory.dispose();
    }
  });

  test('a live dish without a photo has the missing-image UI and a >5MB image is rejected', async ({
    page,
  }) => {
    await page.goto('/menu', { waitUntil: 'domcontentloaded' });
    const card = page.locator('.group').filter({ hasText: 'Factory menu contract dish' });
    await expect(card).toBeVisible();
    await expect(card.getByRole('img', { name: 'Factory menu contract dish' })).toHaveCount(0);

    await card.getByRole('button', { name: 'Edit Factory menu contract dish' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add photo' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'too-large.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await page.getByRole('button', { name: 'Save dish' }).click();
    await expect(page.getByText('Dish saved, but some photos failed to upload')).toBeVisible();
    await expect
      .poll(async () =>
        factory.prisma.menuItem.findUniqueOrThrow({
          where: { id: itemId },
          select: { imageUrls: true },
        }),
      )
      .toMatchObject({ imageUrls: [] });
  });

  test('removing the final allergen from a live dish is rejected and does not silently publish it', async ({
    page,
  }) => {
    await page.goto('/menu', { waitUntil: 'domcontentloaded' });
    const accessToken = await token(page);
    const apiUrl = process.env.TEST_API_URL ?? 'http://localhost:3001';
    const result = await page.evaluate(
      async ({ url, bearer, vendor, menu, item }) => {
        const response = await fetch(`${url}/v1/vendors/${vendor}/menus/${menu}/items/${item}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ allergens: [], allergensFreeFrom: false, isAvailable: true }),
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      },
      { url: apiUrl, bearer: accessToken, vendor: vendorId, menu: menuId, item: itemId },
    );
    expect(result.status).toBe(400);
    await expect
      .poll(async () =>
        factory.prisma.menuItem.findUniqueOrThrow({
          where: { id: itemId },
          select: { allergens: true, allergensFreeFrom: true, isAvailable: true },
        }),
      )
      .toMatchObject({ allergens: ['milk'], allergensFreeFrom: false, isAvailable: true });
  });
});
