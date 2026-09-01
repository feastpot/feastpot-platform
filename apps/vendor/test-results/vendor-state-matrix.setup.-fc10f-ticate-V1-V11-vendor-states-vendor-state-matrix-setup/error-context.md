# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: vendor-state-matrix.setup.ts >> provision and authenticate V1-V11 vendor states
- Location: e2e/vendor-state-matrix.setup.ts:55:6

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 20000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]:
    - generic [ref=e3]:
      - heading "Unable to verify Vendor Terms" [level=1] [ref=e4]
      - paragraph [ref=e5]: We could not confirm your current acceptance record. Refresh the page to try again, or review and accept the current terms before continuing.
      - link "Review Vendor Terms" [ref=e6] [cursor=pointer]:
        - /url: /onboarding/terms
  - button "Open Tanstack query devtools" [ref=e57] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e111] [cursor=pointer]
  - alert [ref=e115]
```

# Test source

```ts
  1  | import { writeFileSync } from 'node:fs';
  2  | 
  3  | import { expect, test as setup, type Page } from '@playwright/test';
  4  | 
  5  | import { TestDataFactory, type TestIdentity } from '../../../scripts/test-factory';
  6  | 
  7  | import {
  8  |   configuredMatrixStates,
  9  |   matrixManifestPath,
  10 |   matrixNamespace,
  11 |   matrixStorageStatePath,
  12 |   type VendorMatrixState,
  13 |   type VendorStateMatrixManifest,
  14 |   VENDOR_MATRIX_STATES,
  15 | } from './helpers/vendor-state-matrix';
  16 | 
  17 | async function signIn(
  18 |   page: Page,
  19 |   email: string,
  20 |   password: string,
  21 |   applicantWithoutVendor = false,
  22 | ): Promise<void> {
  23 |   await page.goto('/sign-in');
  24 |   const emailInput = page.locator('#email');
  25 |   const passwordInput = page.locator('#password');
  26 | 
  27 |   await emailInput.waitFor({ state: 'visible' });
  28 |   await emailInput.evaluate((element) => element.removeAttribute('readonly'));
  29 |   await emailInput.fill(email);
  30 |   await passwordInput.waitFor({ state: 'visible' });
  31 |   await passwordInput.evaluate((element) => element.removeAttribute('readonly'));
  32 |   await passwordInput.fill(password);
  33 |   if (applicantWithoutVendor) {
  34 |     await page.locator('button[type="submit"]').click();
  35 |     await expect
  36 |       .poll(
  37 |         () =>
  38 |           page.evaluate(() =>
  39 |             Object.keys(localStorage).some(
  40 |               (key) => key.includes('auth-token') && localStorage.getItem(key)?.includes('access_token'),
  41 |             ),
  42 |           ),
  43 |         { timeout: 20_000 },
  44 |       )
> 45 |       .toBe(true);
     |        ^ Error: expect(received).toBe(expected) // Object.is equality
  46 |     return;
  47 |   }
  48 | 
  49 |   await Promise.all([
  50 |     page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 20_000 }),
  51 |     page.locator('button[type="submit"]').click(),
  52 |   ]);
  53 | }
  54 | 
  55 | setup('provision and authenticate V1-V11 vendor states', async ({ browser }) => {
  56 |   setup.setTimeout(5 * 60_000);
  57 |   const namespace = matrixNamespace();
  58 |   const factory = TestDataFactory.fromEnvironment({ namespace });
  59 |   const identities = {} as Record<VendorMatrixState, TestIdentity>;
  60 |   const states = configuredMatrixStates();
  61 | 
  62 |   try {
  63 |     for (const state of states) {
  64 |       const identity = await factory.create(state);
  65 |       if (!identity.credentials.password) {
  66 |         throw new Error(`Vendor state ${state} has no password; set TEST_FACTORY_PASSWORD.`);
  67 |       }
  68 | 
  69 |       const context = await browser.newContext();
  70 |       const page = await context.newPage();
  71 |       await signIn(
  72 |         page,
  73 |         identity.credentials.email,
  74 |         identity.credentials.password,
  75 |         state === 'V1',
  76 |       );
  77 |       await context.storageState({ path: matrixStorageStatePath(state, namespace) });
  78 |       await context.close();
  79 |       identities[state] = identity;
  80 |     }
  81 | 
  82 |     const manifest: VendorStateMatrixManifest = { namespace, identities };
  83 |     writeFileSync(matrixManifestPath(namespace), JSON.stringify(manifest, null, 2));
  84 |     expect(Object.keys(identities)).toHaveLength(states.length);
  85 |   } finally {
  86 |     if (Object.keys(identities).length !== states.length) {
  87 |       for (const identity of Object.values(identities)) {
  88 |         await factory.teardown(identity);
  89 |       }
  90 |     }
  91 |     await factory.dispose();
  92 |   }
  93 | });
  94 | 
```