# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth/a-signup.spec.ts >> A4: enumeration timing safety >> A4: median response time delta between new and existing confirmed user < 150 ms
- Location: e2e/auth/a-signup.spec.ts:161:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Check your email' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Check your email' })

```

```yaml
- link "Skip to main content":
  - /url: "#main-content"
- banner:
  - button "Go back"
  - heading "Sign in" [level=1]
  - button "Notifications"
  - button "Basket (0 items)"
- main:
  - complementary:
    - heading "Welcome to FeastPot" [level=1]
    - paragraph: Sign in or create your account without leaving the page. The URL stays the same and only the relevant form fields are rendered.
    - paragraph: Order faster next time
    - list:
      - listitem: Save delivery addresses
      - listitem: Track orders
      - listitem: Earn FeastPoints
      - listitem: Reorder favourites
      - listitem: Store allergen notes
    - paragraph: Secure login
    - paragraph: Rewards ready
    - paragraph: Allergen profile
  - region "Create account":
    - tablist "Authentication mode":
      - tab "Sign in"
      - tab "Create account" [selected]
    - tabpanel "Create your Feastpot account":
      - heading "Create your Feastpot account" [level=2]
      - paragraph: Save addresses, earn FeastPoints and reorder favourites in one tap.
      - alert: Too many attempts. Please wait a few minutes before trying again.
      - text: Full name
      - textbox "Full name":
        - /placeholder: e.g. Amara Okafor
        - text: Amara Okafor
      - text: Email address
      - textbox "Email address":
        - /placeholder: you@email.com
        - text: timing-1786970136991@example-feastpot.com
      - text: Phone number (optional)
      - textbox "Phone number (optional)":
        - /placeholder: 07XXX XXX XXX
      - text: Password
      - textbox "Password":
        - /placeholder: Create a strong password
        - text: StrongPass1!
      - button "Show password":
        - img
      - list "Password requirements":
        - listitem: At least 8 characters
        - listitem: Lowercase letter
        - listitem: Uppercase letter
        - listitem: Number
        - listitem: Special character
      - text: Confirm password
      - textbox "Confirm password":
        - /placeholder: Confirm your password
        - text: StrongPass1!
      - button "Show password":
        - img
      - text: Postcode / service area
      - textbox "Postcode / service area":
        - /placeholder: e.g. SW1A 1AA
        - text: E1 6RF
      - checkbox "Send me offers, updates and recommendations"
      - text: Send me offers, updates and recommendations
      - checkbox "I agree to the Terms of Service and Privacy Policy" [checked]
      - text: I agree to the
      - link "Terms of Service":
        - /url: /legal/terms
      - text: and
      - link "Privacy Policy":
        - /url: /legal/privacy
      - button "Create account"
      - text: or sign up with
      - button "Continue with Google"
      - button "Continue with Apple"
      - paragraph: Your information is secure and never shared.
      - paragraph:
        - text: Already have an account?
        - button "Sign in"
- contentinfo:
  - region "Why Feastpot":
    - list:
      - listitem:
        - paragraph: Local flavours
        - paragraph: Support local kitchens
      - listitem:
        - paragraph: Great value
        - paragraph: Clear, transparent pricing
      - listitem:
        - paragraph: Made with care
        - paragraph: Real food, real people
      - listitem:
        - paragraph: Support that answers
        - paragraph: Email support, Monday to Saturday
  - paragraph: Cook from home? Join Feastpot
  - paragraph: Sell party trays, family pots and weekly meals to customers near you. Keep your food business moving without chasing DMs.
  - link "Join Feastpot":
    - /url: /become-a-vendor
  - list:
    - listitem:
      - link "Home":
        - /url: /
    - listitem:
      - link "Vendors":
        - /url: /vendors
    - listitem:
      - link "Help & FAQ":
        - /url: /help
    - listitem:
      - link "Catering":
        - /url: /catering
    - listitem:
      - link "Become a vendor":
        - /url: /become-a-vendor
    - listitem:
      - link "Vendor readiness":
        - /url: /vendor-readiness
    - listitem:
      - link "Trust and safety":
        - /url: /trust
    - listitem:
      - link "Privacy Policy":
        - /url: /legal/privacy
    - listitem:
      - link "Terms of Service":
        - /url: /legal/terms
    - listitem:
      - link "Cookie Policy":
        - /url: /legal/cookies
    - listitem:
      - link "Allergen info":
        - /url: /legal/allergens
    - listitem:
      - link "Vendor Terms":
        - /url: /legal/vendor-terms
  - paragraph: © 2026 Feastpot Ltd · England and Wales
  - paragraph:
    - text: ICO Registration ZC146267 ·
    - link "support@feastpot.co.uk":
      - /url: mailto:support@feastpot.co.uk
  - link "X (Twitter)":
    - /url: https://x.com/feastpot
  - link "Instagram":
    - /url: https://www.instagram.com/feastpot.co.uk
  - link "TikTok":
    - /url: https://www.tiktok.com/@feastpot.co.uk?lang=en-GB
- navigation "Primary":
  - list:
    - listitem:
      - link "Home":
        - /url: /
    - listitem:
      - link "Browse":
        - /url: /vendors
    - listitem:
      - link "Orders":
        - /url: /orders
    - listitem:
      - link "Sign in":
        - /url: /sign-in
- dialog "Cookie notice":
  - paragraph:
    - text: We use cookies for essential platform functionality. No advertising cookies.
    - link "Read our privacy policy":
      - /url: /legal/privacy
    - text: .
  - button "Essential only"
  - button "Accept all"
- region "Notifications (F8)":
  - list
- button "Open Tanstack query devtools":
  - img
- alert
```

# Test source

```ts
  76  |     const localPart = `a1-${Date.now()}`;
  77  |     const email = mailosaurAddress(localPart);
  78  | 
  79  |     await page.goto(URLS.register);
  80  |     await fillAndSubmit(page, { email });
  81  | 
  82  |     // UI shows confirmation screen.
  83  |     await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
  84  |       timeout: 10_000,
  85  |     });
  86  | 
  87  |     // Email arrives within 60 s.
  88  |     const message = await waitForEmail(email, 60_000);
  89  |     expect(message.subject).toMatch(/confirm|activate|verify/i);
  90  | 
  91  |     // The link goes to /auth/confirm (scanner-proof interstitial).
  92  |     const link = extractConfirmLink(message);
  93  |     expect(link).toContain('/auth/confirm');
  94  |     expect(link).toContain('#token_hash=');
  95  |     expect(link).toContain('type=signup');
  96  | 
  97  |     await purgeInbox();
  98  |   });
  99  | });
  100 | 
  101 | // ---------------------------------------------------------------------------
  102 | // A2: Existing CONFIRMED user (covered by register.spec.ts test 2; reference)
  103 | // ---------------------------------------------------------------------------
  104 | 
  105 | test.describe('A2: existing confirmed user', () => {
  106 |   test('A2: existing confirmed email shows identical neutral screen (no enumeration)', async ({
  107 |     page,
  108 |   }) => {
  109 |     // Supabase returns HTTP 200 with empty identities for an already-confirmed account.
  110 |     const email = `existing+confirmed-${Date.now()}@example-feastpot.com`;
  111 |     await mockSignup(page, signupConfirmedUser(email));
  112 | 
  113 |     await page.goto(URLS.register);
  114 |     await fillAndSubmit(page, { email });
  115 | 
  116 |     // UI must be byte-for-byte the same as A1.
  117 |     await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  118 | 
  119 |     // PASS criterion: no text reveals account existence.
  120 |     const body = await page.textContent('body');
  121 |     expect(body).not.toMatch(/already (exists|registered)/i);
  122 |     expect(body).not.toMatch(/account.*found/i);
  123 |     expect(body).not.toMatch(/try.*sign.?in/i);
  124 |   });
  125 | });
  126 | 
  127 | // ---------------------------------------------------------------------------
  128 | // A3: Existing UNCONFIRMED user
  129 | // ---------------------------------------------------------------------------
  130 | 
  131 | test.describe('A3: existing unconfirmed user', () => {
  132 |   test('A3: unconfirmed re-signup shows confirmation screen; no silent password overwrite message', async ({
  133 |     page,
  134 |   }) => {
  135 |     // Supabase re-sends the confirmation email and returns identities non-empty.
  136 |     const email = `existing+unconfirmed-${Date.now()}@example-feastpot.com`;
  137 |     await mockSignup(page, signupUnconfirmedUser(email));
  138 | 
  139 |     await page.goto(URLS.register);
  140 |     await fillAndSubmit(page, { email });
  141 | 
  142 |     // The confirmation screen appears (Supabase re-sent the link).
  143 |     await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  144 | 
  145 |     // SECURITY: the UI must NOT say "your password was updated" or similar,
  146 |     // because the old password is still valid until the user confirms.
  147 |     // An unconfirmed account in Supabase can have its password silently
  148 |     // overwritten by re-signup; the UI must not disclose or encourage this.
  149 |     const body = await page.textContent('body');
  150 |     expect(body).not.toMatch(/password.*updated/i);
  151 |     expect(body).not.toMatch(/password.*changed/i);
  152 |     expect(body).not.toMatch(/new password/i);
  153 |   });
  154 | });
  155 | 
  156 | // ---------------------------------------------------------------------------
  157 | // A4: Enumeration timing safety
  158 | // ---------------------------------------------------------------------------
  159 | 
  160 | test.describe('A4: enumeration timing safety', () => {
  161 |   test('A4: median response time delta between new and existing confirmed user < 150 ms', async ({
  162 |     page,
  163 |   }) => {
  164 |     const RUNS = 20;
  165 |     const newUserTimes: number[] = [];
  166 |     const confirmedUserTimes: number[] = [];
  167 | 
  168 |     const email = `timing-${Date.now()}@example-feastpot.com`;
  169 | 
  170 |     // Collect timings for new-user path (identities populated).
  171 |     for (let i = 0; i < RUNS; i++) {
  172 |       await mockSignup(page, signupNewUser(email));
  173 |       await page.goto(URLS.register);
  174 |       const t0 = Date.now();
  175 |       await fillAndSubmit(page, { email });
> 176 |       await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
      |                                                                             ^ Error: expect(locator).toBeVisible() failed
  177 |       newUserTimes.push(Date.now() - t0);
  178 |     }
  179 | 
  180 |     // Collect timings for confirmed-user path (identities empty).
  181 |     for (let i = 0; i < RUNS; i++) {
  182 |       await mockSignup(page, signupConfirmedUser(email));
  183 |       await page.goto(URLS.register);
  184 |       const t0 = Date.now();
  185 |       await fillAndSubmit(page, { email });
  186 |       await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  187 |       confirmedUserTimes.push(Date.now() - t0);
  188 |     }
  189 | 
  190 |     const median = (arr: number[]) => {
  191 |       const sorted = [...arr].sort((a, b) => a - b);
  192 |       const mid = Math.floor(sorted.length / 2);
  193 |       return sorted.length % 2 !== 0
  194 |         ? sorted[mid]
  195 |         : (sorted[mid - 1] + sorted[mid]) / 2;
  196 |     };
  197 | 
  198 |     const newMedian = median(newUserTimes);
  199 |     const confirmedMedian = median(confirmedUserTimes);
  200 |     const delta = Math.abs(newMedian - confirmedMedian);
  201 | 
  202 |     // PASS: median delta < 150 ms; both paths take similar wall-clock time.
  203 |     expect(delta).toBeLessThan(150);
  204 | 
  205 |     // PASS: both paths render the same heading (body-level enumeration check).
  206 |     // (Verified per-run above; this is a summary assertion.)
  207 |     expect(newMedian).toBeGreaterThan(0);
  208 |     expect(confirmedMedian).toBeGreaterThan(0);
  209 |   });
  210 | 
  211 |   test('A4: response body is identical for new vs confirmed user (no field reveals account existence)', async ({
  212 |     page,
  213 |   }) => {
  214 |     const email = `enum-body-${Date.now()}@example-feastpot.com`;
  215 | 
  216 |     await mockSignup(page, signupNewUser(email));
  217 |     await page.goto(URLS.register);
  218 |     await fillAndSubmit(page, { email });
  219 |     await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  220 |     const newBody = await page.textContent('body');
  221 | 
  222 |     await mockSignup(page, signupConfirmedUser(email));
  223 |     await page.goto(URLS.register);
  224 |     await fillAndSubmit(page, { email });
  225 |     await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  226 |     const confirmedBody = await page.textContent('body');
  227 | 
  228 |     // Both paths must render the same visible text (emails match so the body is identical).
  229 |     expect(newBody).toBe(confirmedBody);
  230 |   });
  231 | });
  232 | 
```