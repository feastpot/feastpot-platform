# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.setup.ts >> authenticate as test vendor
- Location: e2e/auth.setup.ts:25:6

# Error details

```
Error: locator.waitFor: Error: strict mode violation: locator('input[type="password"]') resolved to 2 elements:
    1) <input tabindex="-1" type="password" name="fakepasswordremembered" autocomplete="current-password"/> aka locator('input[name="fakepasswordremembered"]')
    2) <input readonly value="" id="password" type="password" autocorrect="off" spellcheck="false" name="vendor-password" autocomplete="new-password" class="w-full rounded-xl border bg-white py-3 pl-10 pr-11 text-sm font-medium outline-none"/> aka getByRole('textbox', { name: 'Password' })

Call log:
  - waiting for locator('input[type="password"]') to be visible

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e13]:
        - link "Feastpot vendor home" [ref=e14] [cursor=pointer]:
          - /url: /sign-in
          - img "Feastpot" [ref=e15]
        - heading "Welcome back, vendor" [level=1] [ref=e16]: Welcome back,vendor
        - paragraph [ref=e17]: Log in to manage orders, update your menu,and grow your food business.
        - list [ref=e18]:
          - listitem [ref=e19]:
            - generic [ref=e24]:
              - generic [ref=e25]: Manage orders
              - generic [ref=e26]: View and manage incoming orders
          - listitem [ref=e27]:
            - generic [ref=e32]:
              - generic [ref=e33]: Update your menu
              - generic [ref=e34]: Add dishes, edit prices, update availability
          - listitem [ref=e35]:
            - generic [ref=e39]:
              - generic [ref=e40]: Track payouts
              - generic [ref=e41]: See your earnings and payout history
    - main [ref=e44]:
      - generic [ref=e45]:
        - heading "Sign in to your vendor account" [level=2] [ref=e51]
        - generic [ref=e52]:
          - textbox
          - textbox
          - generic [ref=e53]:
            - generic [ref=e54]: Email
            - textbox "Email" [active] [ref=e56]:
              - /placeholder: you@domain.com
              - text: real@address.com
          - generic [ref=e57]:
            - generic [ref=e58]: Password
            - generic [ref=e59]:
              - textbox "Password" [ref=e60]
              - button "Show password" [ref=e61] [cursor=pointer]
          - generic [ref=e65]:
            - generic [ref=e66] [cursor=pointer]:
              - checkbox "Remember me" [checked] [ref=e68]
              - generic [ref=e69]: Remember me
            - link "Forgot password?" [ref=e70] [cursor=pointer]:
              - /url: /forgot-password
          - button "Sign in" [ref=e71] [cursor=pointer]
        - link "Need help? Contact vendor support" [ref=e76] [cursor=pointer]:
          - /url: mailto:vendors@feastpot.co.uk
          - generic [ref=e79]: Need help?
          - text: Contact vendor support
  - region "Notifications (F8)":
    - list
  - button "Open Tanstack query devtools" [ref=e130] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e184] [cursor=pointer]
  - alert [ref=e188]
```

# Test source

```ts
  1  | /**
  2  |  * Playwright auth setup project.
  3  |  *
  4  |  * Signs in with the test vendor account and persists the Supabase session
  5  |  * (cookies + localStorage) to e2e/.auth/vendor.json so subsequent test
  6  |  * projects can load it via storageState without repeating sign-in.
  7  |  *
  8  |  * Prerequisites:
  9  |  *   TEST_VENDOR_EMAIL and TEST_VENDOR_PASSWORD must be set.
  10 |  *   The account must belong to a vendor in `live` or `probation` status
  11 |  *   so the middleware lets it through to /menu.
  12 |  *
  13 |  * If the env vars are absent the file is written as empty JSON and a
  14 |  * warning is printed. Tests that require auth will see redirect-to-
  15 |  *  /sign-in and fail immediately rather than silently producing false
  16 |  * passes.
  17 |  */
  18 | import * as fs from 'fs';
  19 | import * as path from 'path';
  20 | 
  21 | import { test as setup } from '@playwright/test';
  22 | 
  23 | const STATE_PATH = path.join(__dirname, '.auth', 'vendor.json');
  24 | 
  25 | setup('authenticate as test vendor', async ({ page }) => {
  26 |   const email = process.env.TEST_VENDOR_EMAIL;
  27 |   const password = process.env.TEST_VENDOR_PASSWORD;
  28 | 
  29 |   if (!email || !password) {
  30 |     // Write a sentinel so storageState doesn't crash downstream projects.
  31 |     // Tests will still fail because the portal redirects unauthenticated
  32 |     // visitors to /sign-in -- that is the desired, visible failure mode.
  33 |     fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  34 |     fs.writeFileSync(STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
  35 |     console.warn(
  36 |       '\n[auth setup] TEST_VENDOR_EMAIL / TEST_VENDOR_PASSWORD not set.\n' +
  37 |         'Tests that reach a gated route will fail with a sign-in redirect.\n',
  38 |     );
  39 |     return;
  40 |   }
  41 | 
  42 |   await page.goto('/sign-in');
  43 | 
  44 |   // The sign-in form uses a readonly anti-autofill trick: inputs start with
  45 |   // readonly="true" to prevent Chrome from pre-filling them, then JS removes
  46 |   // the attribute. Playwright's fill() waits for editability and times out
  47 |   // if the attribute is never removed. Strip it manually before filling.
  48 |   const emailInput = page.locator('input[type="email"]');
  49 |   const passwordInput = page.locator('input[type="password"]');
  50 | 
  51 |   await emailInput.waitFor({ state: 'visible' });
  52 |   await emailInput.evaluate((el) => el.removeAttribute('readonly'));
  53 |   await emailInput.fill(email);
  54 | 
> 55 |   await passwordInput.waitFor({ state: 'visible' });
     |                       ^ Error: locator.waitFor: Error: strict mode violation: locator('input[type="password"]') resolved to 2 elements:
  56 |   await passwordInput.evaluate((el) => el.removeAttribute('readonly'));
  57 |   await passwordInput.fill(password);
  58 | 
  59 |   await page.locator('button[type="submit"]').click();
  60 | 
  61 |   // Wait for the portal to settle on an authenticated route.
  62 |   // Newly-approved vendors land on /onboarding; live vendors land on /.
  63 |   await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
  64 |     timeout: 15_000,
  65 |   });
  66 | 
  67 |   fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  68 |   await page.context().storageState({ path: STATE_PATH });
  69 | });
  70 | 
```