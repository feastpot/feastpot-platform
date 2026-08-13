# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.setup.ts >> authenticate as test vendor
- Location: e2e/auth.setup.ts:25:6

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
        - alert [ref=e52]: Invalid email or password.
        - generic [ref=e53]:
          - textbox
          - textbox
          - generic [ref=e54]:
            - generic [ref=e55]: Email
            - textbox "Email" [ref=e57]:
              - /placeholder: you@domain.com
              - text: real@address.com
          - generic [ref=e58]:
            - generic [ref=e59]: Password
            - generic [ref=e60]:
              - textbox "Password" [ref=e61]: realpassword
              - button "Show password" [ref=e62] [cursor=pointer]
          - generic [ref=e66]:
            - generic [ref=e67] [cursor=pointer]:
              - checkbox "Remember me" [checked] [ref=e69]
              - generic [ref=e70]: Remember me
            - link "Forgot password?" [ref=e71] [cursor=pointer]:
              - /url: /forgot-password
          - button "Sign in" [ref=e72] [cursor=pointer]
        - link "Need help? Contact vendor support" [ref=e77] [cursor=pointer]:
          - /url: mailto:vendors@feastpot.co.uk
          - generic [ref=e80]: Need help?
          - text: Contact vendor support
  - region "Notifications (F8)":
    - list
  - button "Open Tanstack query devtools" [ref=e131] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e185] [cursor=pointer]
  - alert [ref=e189]
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
  44 |   // The sign-in form has two anti-autofill measures:
  45 |   //   1. A hidden honeypot password input (name="fakepasswordremembered") that
  46 |   //      causes input[type="password"] to resolve to 2 elements, triggering
  47 |   //      Playwright strict-mode violations.
  48 |   //   2. readonly="true" on the real inputs until a user interaction fires.
  49 |   //
  50 |   // Fix: target the real fields by their stable IDs (#email, #password) and
  51 |   // strip readonly before filling.
  52 |   const emailInput = page.locator('#email');
  53 |   const passwordInput = page.locator('#password');
  54 | 
  55 |   await emailInput.waitFor({ state: 'visible' });
  56 |   await emailInput.evaluate((el) => el.removeAttribute('readonly'));
  57 |   await emailInput.fill(email);
  58 | 
  59 |   await passwordInput.waitFor({ state: 'visible' });
  60 |   await passwordInput.evaluate((el) => el.removeAttribute('readonly'));
  61 |   await passwordInput.fill(password);
  62 | 
  63 |   await page.locator('button[type="submit"]').click();
  64 | 
  65 |   // Wait for the portal to settle on an authenticated route.
  66 |   // Newly-approved vendors land on /onboarding; live vendors land on /.
> 67 |   await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
     |              ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  68 |     timeout: 15_000,
  69 |   });
  70 | 
  71 |   fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  72 |   await page.context().storageState({ path: STATE_PATH });
  73 | });
  74 | 
```