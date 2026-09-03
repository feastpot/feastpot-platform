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

function safeProfileResponseBody(body: string): string {
  const maxLength = 2_000;
  try {
    const redact = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(redact);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          /password|secret|token|authorization|cookie|email|phone|address|bank/i.test(key)
            ? '[REDACTED]'
            : redact(child),
        ]),
      );
    };
    return JSON.stringify(redact(JSON.parse(body))).slice(0, maxLength);
  } catch {
    return body
      .slice(0, maxLength)
      .replace(/(bearer\s+|token[=:]\s*|password[=:]\s*)[^\s,"]+/gi, '$1[REDACTED]');
  }
}

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
  const profileResponse = page
    .waitForResponse((response) => new URL(response.url()).pathname === '/v1/vendors/me', {
      timeout: 20_000,
    })
    .catch(() => null);
  try {
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 20_000 }),
      page.locator('button[type="submit"]').click(),
    ]);
  } catch (error) {
    const pageError = await page
      .locator('[role="alert"], [data-sonner-toast], .text-red-600, .text-destructive')
      .first()
      .textContent({ timeout: 1_000 })
      .catch(() => null);
    const profile = await profileResponse;
    const profileDetail = profile
      ? profile.ok()
        ? `Profile API: ${profile.status()} from ${new URL(profile.url()).origin} (successful response body omitted).`
        : `Profile API: ${profile.status()} from ${new URL(profile.url()).origin}; response body: ${safeProfileResponseBody(
            await profile.text().catch(() => 'Unable to read body.'),
          )}`
      : 'Profile API: no /v1/vendors/me response was observed.';
    throw new Error(
      `vendor state matrix: sign-in did not redirect for ${email}. Current URL: ${page.url()}\n` +
        `${profileDetail}\n` +
        (pageError ? `Page shows: "${pageError.trim()}"\n` : '') +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
      identities[state] = identity;

      const context = await browser.newContext();
      if (state !== 'V1') {
        try {
          await factory.issueAccessToken(identity);
        } catch (error) {
          throw new Error(
            `vendor state matrix: Supabase password preflight failed for ${state} before browser sign-in: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const page = await context.newPage();
        await signIn(page, identity.credentials.email, identity.credentials.password);
      }
      await context.storageState({ path: matrixStorageStatePath(state, namespace) });
      await context.close();
    }

    const manifest: VendorStateMatrixManifest = { namespace, identities };
    writeFileSync(matrixManifestPath(namespace), JSON.stringify(manifest, null, 2));
    expect(Object.keys(identities)).toHaveLength(states.length);
  } finally {
    if (Object.keys(identities).length !== states.length) {
      for (const identity of Object.values(identities)) {
        await factory.teardown(identity);
      }
    }
    await factory.dispose();
  }
});
