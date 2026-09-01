import { writeFileSync } from 'node:fs';

import { expect, test as setup, type Page } from '@playwright/test';

import { TestDataFactory, type TestIdentity } from '../../../scripts/test-factory';

import {
  configuredMatrixStates,
  matrixManifestPath,
  matrixNamespace,
  matrixStorageStatePath,
  type VendorMatrixState,
  type VendorStateMatrixManifest,
  VENDOR_MATRIX_STATES,
} from './helpers/vendor-state-matrix';

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-in');
  const emailInput = page.locator('#email');
  const passwordInput = page.locator('#password');

  await emailInput.waitFor({ state: 'visible' });
  await emailInput.evaluate((element) => element.removeAttribute('readonly'));
  await emailInput.fill(email);
  await passwordInput.waitFor({ state: 'visible' });
  await passwordInput.evaluate((element) => element.removeAttribute('readonly'));
  await passwordInput.fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 20_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
}

setup('provision and authenticate V1-V11 vendor states', async ({ browser }) => {
  setup.setTimeout(5 * 60_000);
  const namespace = matrixNamespace();
  const factory = TestDataFactory.fromEnvironment({ namespace });
  const identities = {} as Record<VendorMatrixState, TestIdentity>;
  const states = configuredMatrixStates();

  try {
    for (const state of states) {
      const identity = await factory.create(state);
      if (!identity.credentials.password) {
        throw new Error(`Vendor state ${state} has no password; set TEST_FACTORY_PASSWORD.`);
      }

      const context = await browser.newContext();
      const page = await context.newPage();
      await signIn(page, identity.credentials.email, identity.credentials.password);
      await context.storageState({ path: matrixStorageStatePath(state, namespace) });
      await context.close();
      identities[state] = identity;
    }

    const manifest: VendorStateMatrixManifest = { namespace, identities };
    writeFileSync(matrixManifestPath(namespace), JSON.stringify(manifest, null, 2));
    expect(Object.keys(identities)).toHaveLength(states.length);
  } finally {
    await factory.dispose();
  }
});
