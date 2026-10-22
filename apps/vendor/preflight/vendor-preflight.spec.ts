import { expect, test } from '@playwright/test';

import { TestDataFactory } from '../../../scripts/test-factory';
import { browserAccessToken } from '../e2e/helpers/browser-access-token';
import {
  cleanupPreflight,
  preflightNamespaces,
  requireBrowserSession,
} from '../e2e/helpers/vendor-preflight';
import { vendorSignIn } from '../e2e/helpers/vendor-sign-in';

const root = process.env.TEST_FACTORY_NAMESPACE ?? '';
const scopes = preflightNamespaces(root);
const owners = [
  { namespace: scopes.actor, state: 'V4' as const },
  { namespace: scopes.target, state: 'V9' as const },
].map((owner) => ({
  ...owner,
  factory: TestDataFactory.fromEnvironment({ namespace: owner.namespace }),
}));

test.afterAll(async () => {
  // Hooks receive their own timeout after the bounded browser test fails.
  test.setTimeout(60_000);
  await cleanupPreflight(root, owners);
});

test('VP-1: browser cookies, recovery, fresh login, foreign ownership and cleanup', async ({
  page,
}, testInfo) => {
  const started = Date.now();
  try {
    const actor =
      await test.step('provision isolated actor and eligible foreign target', async () => {
        const actor = await owners[0].factory.create('V4');
        if (!actor.credentials.password) throw new Error('VENDOR_PREFLIGHT_PASSWORD_REQUIRED');
        return actor;
      });
    const target = await owners[1].factory.createPurchaseVendor();
    expect(target.vendorId).toBeTruthy();
    expect(target.menuId).toBeTruthy();
    expect(target.menuItemId).toBeTruthy();
    expect(target.vendorId).not.toBe(actor.vendorId);
    expect(target.userId).not.toBe(actor.userId);
    await test.step('real browser-cookie sign-in', async () => {
      await vendorSignIn(page, actor.credentials.email, actor.credentials.password!);
      await requireBrowserSession(() => browserAccessToken(page));
    });
    await test.step('recovery page clears the browser session', async () => {
      await page.goto('/not-registered');
      await expect(page.getByRole('heading', { name: 'Vendor account required' })).toBeVisible();
      await expect
        .poll(async () =>
          (await page.context().cookies()).filter(
            (cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name) && cookie.value,
          ),
        )
        .toEqual([]);
      await page.goto('/menu');
      await expect(page).toHaveURL(/\/sign-in/);
    });
    const bearer = await test.step('fresh form sign-in and real cookie reader', async () => {
      await vendorSignIn(page, actor.credentials.email, actor.credentials.password!);
      return requireBrowserSession(() => browserAccessToken(page));
    });
    await test.step('eligible foreign menu rejects mutation with the ownership reason', async () => {
      const before = await owners[1].factory.prisma.menuItem.findUniqueOrThrow({
        where: { id: target.menuItemId },
      });
      const result = await page.evaluate(
        async ({ api, token, vendor, menu, item }) => {
          const response = await fetch(`${api}/v1/vendors/${vendor}/menus/${menu}/items/${item}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Preflight forbidden mutation' }),
          });
          return { status: response.status, code: (await response.json()).code };
        },
        {
          api: process.env.TEST_API_URL!,
          token: bearer,
          vendor: target.vendorId!,
          menu: target.menuId!,
          item: target.menuItemId!,
        },
      );
      expect(result).toEqual({ status: 403, code: 'NOT_VENDOR_OWNER' });
      expect(
        await owners[1].factory.prisma.menuItem.findUniqueOrThrow({
          where: { id: target.menuItemId },
        }),
      ).toEqual(before);
    });
  } finally {
    const durationMs = Date.now() - started;
    console.log(`VENDOR_PREFLIGHT_DURATION_MS=${durationMs}; budget=180000`);
    await testInfo.attach('preflight-timing', {
      body: JSON.stringify({ durationMs, budgetMs: 180_000 }),
      contentType: 'application/json',
    });
  }
});
