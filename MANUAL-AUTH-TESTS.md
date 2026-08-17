# Manual Authentication Test Protocol

Last updated: 2026-08-17
Supabase project (prod): `yeklvhoqanxnogjnhkui` (London)

---

## How to use this document

Every matrix row below maps to the test brief. Rows marked **Automated** have a
corresponding Playwright spec under `apps/web/e2e/auth/`. Rows marked **Manual** have
step-by-step instructions and explicit PASS/FAIL criteria here. Run automated tests first;
use this document only for the rows that cannot be driven by Playwright.

```
npx playwright test --config apps/web/playwright.config.ts e2e/auth/
```

For real-email tests (A1-real, E1-real) also set:
```
TEST_MAILOSAUR_API_KEY=...
TEST_MAILOSAUR_SERVER_ID=...
```

For vendor subdomain isolation tests (I2, I4) also set:
```
TEST_VENDOR_BASE_URL=http://vendor.localhost:3002
```

---

## Summary table

| ID | Test case | Mode | Last result |
|----|-----------|------|-------------|
| A1-mock | New user sign-up (mock) | Automated | PASS |
| A1-real | New user sign-up (real email, Mailosaur) | Automated (gated) | - |
| A2 | Existing confirmed user - identical screen | Automated | PASS |
| A3 | Existing unconfirmed user - no silent overwrite | Automated | PASS |
| A4 | Enumeration timing safety (20 runs each) | Automated | PASS |
| B1 | Valid confirmation link, same device | Automated | PASS |
| B2 | Expired link - graceful error + resend option | Automated | PASS |
| B3 | Reused link - second use fails cleanly | Automated | PASS |
| B4 | Tampered token - generic error, no stack trace | Automated | PASS |
| B5 | Cross-device token_hash confirmation | Automated | PASS* |
| B6 | Scanner prefetch protection | Automated | PASS |
| C1 | Resend confirmation works | Automated | PASS |
| C2 | Resend rate limit - friendly "please wait" | Automated | PASS |
| D1 | Correct credentials - session set | Automated | PASS |
| D2 | Wrong password - generic error, no enumeration | Automated | PASS |
| D3 | Unconfirmed sign-in - targeted message + resend | Automated | PASS |
| D4 | Non-existent account - identical to D2 + timing | Automated | PASS |
| E1-mock | Full password reset journey (mock) | Automated | PASS |
| E1-real | Full password reset (real email, Mailosaur) | Automated (gated) | - |
| E2 | Non-existent email reset - enumeration-safe | Automated | PASS |
| E3 | Reset link scanner/cross-device | Automated (partial) | PASS |
| F1 | Rate limiting on all endpoints | Automated (mock) | PASS |
| G1 | Google new user | **Manual** | - |
| G2 | Google existing email - identity linking | **Manual** | - |
| G3 | OAuth cancelled - friendly return to sign-in | Automated | PASS |
| G4 | Apple new user | **Manual** | - |
| G5 | Apple Private Relay | **Manual** | - |
| G6 | Unconfigured provider fails gracefully | Automated | PASS |
| H1 | Session persistence across reload | Automated | PASS |
| H2 | Token refresh without re-login | Automated | PASS |
| H3 | Sign-out clears session | Automated | PASS |
| H4 | Multi-tab sign-out propagation | Automated | PASS |
| I1 | Cookie domain inspection | Automated (static) | PASS |
| I2 | Web session not shared with vendor | Automated (gated) / Manual | PASS* |
| I3 | No .feastpot.co.uk wildcard domain | Automated (static) | PASS |
| I4 | Web and vendor sessions are independent | Automated (gated) / Manual | PASS* |

*PASS with caveat - see individual section below.

---

## B: Confirmation link states

### B5 - Cross-device PKCE (caveat)

**Expected behaviour with our implementation:**

Our confirmation email templates link to `/auth/confirm#token_hash=...&type=signup`.
The `/auth/confirm` page calls `supabase.auth.verifyOtp({ token_hash })`, which is
**device-independent** - no PKCE code verifier is stored in `sessionStorage`. A
fresh browser with no shared storage CAN confirm the link.

This is intentionally better than the standard PKCE code-exchange flow. If the app
ever reverts to using `emailRedirectTo` with a code-based `/auth/callback` URL, B5
would fail because the PKCE verifier from browser A would be absent in browser B.

**Manual verification (optional):**
1. Sign up with a real email (requires Mailosaur or live Supabase custom SMTP).
2. Open the confirmation link from the email on a second device or in an incognito window.
3. PASS: the confirm button works and the account is activated.
4. FAIL: a "code verifier is missing" or "session not found" error appears.

---

## E: Password reset

### E3 - Cross-device reset link (known limitation)

The recovery email uses `ConfirmationURL` (not the token_hash fragment). Supabase
includes the reset code in the URL query string, which IS sent to the server. The
PKCE code verifier for the reset flow is stored in the browser that initiated the
`resetPasswordForEmail()` call.

**Effect:** Opening the reset link on a different device than the one that initiated
the reset WILL fail with a "code verifier is missing" error. This is expected PKCE
behaviour for the code-exchange flow.

**PASS criteria:**
- Reset link opened on the originating device/browser: succeeds.
- Reset link opened on a different device: fails with "code verifier is missing" OR
  the app shows a friendly "please open on the same device" message (not implemented
  yet; logged as a follow-up).

**Scanner prefetch (E3):** The reset link points to `/auth/reset/start`, which renders
an interstitial button and does NOT auto-apply the token on page load. A scanner GET
to the URL will receive the HTML without consuming the token. The user then clicks
the "Set new password" button, which exchanges the token. This matches the B6 behaviour
for confirmation links.

---

## F: Rate limiting

### F1 - Production rate limit verification (manual)

Supabase default limits (custom SMTP plan):
- Sign-up / sign-in: 30 email sends per hour
- OTP verify: 30 per hour
- Password reset: 3 per email per hour (NestJS layer)

**Manual steps:**
1. Using a test Supabase project, rapidly sign up 31+ unique emails in one hour.
2. PASS: the 31st attempt returns a 429 and the UI shows a "please wait" message.
3. Verify the UI does not expose the raw error code `over_email_send_rate_limit`.
4. After the hour window, verify sign-up works again.

Adjust limits at: Authentication > Rate Limits in the Supabase dashboard.

---

## G: OAuth flows

### Prerequisites

- Google OAuth must be enabled in Supabase > Authentication > Providers > Google.
- Apple OAuth must be enabled in Supabase > Authentication > Providers > Apple.
- Valid redirect URIs must be registered at the provider console.
- Use a dedicated test Google account and test Apple ID; never use production credentials.

---

### G1 - Google new user

**Steps:**
1. Open `https://feastpot.co.uk/sign-in` in a fresh incognito window.
2. Click "Continue with Google".
3. Sign in with a Google account that has no prior Feastpot account.
4. Complete the Google consent screen.
5. You are redirected to `/auth/callback?code=...`.

**PASS criteria:**
- You land on the Feastpot home page (not `/sign-in` or `/auth/callback`).
- A new row exists in `public.users` for the Google email address.
- `auth.users` has one identity with `provider = 'google'`.
- No error banner is shown.

**FAIL signals:**
- Redirected back to `/sign-in` with an error.
- The `exchangeCodeForSession` fails (check browser console).
- `/v1/users/sync` logs an error (check API logs).

---

### G2 - Google existing email - identity linking

**Context:** If a user signs up with email/password first and then signs in with Google
(same email, confirmed), Supabase auto-links the Google identity to the existing user.
The user ends up with one `user_id` and two identities (`email` + `google`).

**Steps:**
1. Create a test account via email/password for `testuser@gmail.com` and confirm it.
2. Sign out.
3. In a fresh incognito window, click "Continue with Google" and sign in as `testuser@gmail.com`.

**PASS criteria:**
- You land on the home page.
- `auth.users` contains ONE user with two identities.
- No duplicate user is created.

**FAIL signals:**
- Two separate user records created for the same email.
- Sign-in fails with "account with same email exists".
- A 500 error in Supabase logs.

---

### G3 - OAuth cancelled (Automated)

See `apps/web/e2e/auth/g-oauth.spec.ts` test G3.

---

### G4 - Apple new user

**Steps:**
1. Open `https://feastpot.co.uk/sign-in` on a device signed in to iCloud (Safari on
   iPhone/Mac, or a browser with Apple ID signed in).
2. Click "Continue with Apple".
3. Authenticate with Face ID / Touch ID / Apple ID password.
4. Do NOT hide your email (or use the relay address to test G5).

**PASS criteria:**
- You land on the Feastpot home page.
- A new user row exists with `email` from Apple.
- `auth.users` has one identity with `provider = 'apple'`.

---

### G5 - Apple Private Relay

**Risk:** Supabase has a known behaviour where two different Apple relay addresses for
the same human (one from iOS, one from macOS) can produce two separate Supabase users.
If the user later tries to log in from a different device with a different relay address,
Supabase may throw HTTP 500 "Multiple accounts with the same email" during token exchange.

**Steps:**
1. In Apple's "Sign in with Apple" prompt, choose "Hide My Email".
2. Note the relay address shown (e.g. `abc123@privaterelay.appleid.com`).
3. Complete the sign-in.

**PASS criteria:**
- The account is created with the relay address as email.
- No 500 error in Supabase logs.
- The home page loads (no white screen).

**FAIL signal (document, do not unblock manually):**
- HTTP 500 "Multiple accounts with the same email" in Supabase logs.
  This requires a Supabase support ticket or manual user merge.

**Mitigation status:** Not yet implemented. The `/auth/callback` route catches
`exchangeCodeForSession` errors and redirects to `/sign-in?error=...`. A white screen
does not occur, but the error message may be technical. A follow-up task is needed to
detect this specific error and show a human-friendly "contact support" message.

---

## H: Session lifecycle

### H4 - Multi-tab sign-out (caveat)

The automated Playwright test simulates multi-tab sign-out by dispatching a `StorageEvent`
within the same page context. In a real browser, signing out in one tab fires a `storage`
event in all other same-origin tabs via the browser's built-in localStorage cross-tab
notification. supabase-js listens to this event and fires `onAuthStateChange(SIGNED_OUT)`.

**Manual verification:**
1. Sign in to `feastpot.co.uk` in tab 1.
2. Open `feastpot.co.uk` in tab 2 (same browser window, same session).
3. Sign out in tab 1 (via account menu or by calling `supabase.auth.signOut()` in DevTools).
4. In tab 2, navigate to a protected page (e.g. `/account`).
5. PASS: tab 2 redirects to `/sign-in` without requiring a full page refresh.

---

## I: Cross-subdomain session isolation

### I1 - Findings

**Result: PASS - no action required.**

Neither `apps/web` nor `apps/vendor` sets `cookieOptions.domain` in their Supabase
SSR client configuration. The default `@supabase/ssr` behaviour produces **host-only
cookies** scoped to the exact hostname. In production:

- `feastpot.co.uk` session cookies are not sent to `vendor.feastpot.co.uk`.
- `vendor.feastpot.co.uk` session cookies are not sent to `feastpot.co.uk`.

**Cookie names:** Both apps use the same Supabase project URL (`NEXT_PUBLIC_SUPABASE_URL`),
so the default cookie name is `sb-<project-ref>-auth-token` for both. In production,
the different hostnames provide isolation. In local development, both apps run on
`localhost` (different ports), and since cookies are port-agnostic, there is a
theoretical risk of session bleed between `localhost:3000` and `localhost:3002`. This
is a dev-only concern and does not affect production.

**Recommendation:** If future requirements need to share auth across subdomains (e.g.
for a unified session), use distinct cookie names (`sb-feastpot-web-auth-token` vs
`sb-feastpot-vendor-auth-token`) rather than enabling `.feastpot.co.uk` domain scope.

---

### I2 - Manual verification (production)

**Steps:**
1. Sign in to `https://feastpot.co.uk` as a customer.
2. Without signing out, navigate to `https://vendor.feastpot.co.uk` in the same browser.
3. Open DevTools > Application > Cookies.

**PASS criteria:**
- The auth cookie for `feastpot.co.uk` is listed under the `feastpot.co.uk` domain.
- The same cookie does NOT appear under `vendor.feastpot.co.uk`.
- The vendor portal treats you as unauthenticated (shows vendor sign-in page).

**FAIL signal (I3 defect):**
- The auth cookie appears under `.feastpot.co.uk` (with a leading dot).
  This means `cookieOptions.domain` is set to the parent domain somewhere.
  Fix: remove the domain option or set distinct cookie names per app.

---

### I4 - Manual verification (production)

**Steps:**
1. Sign in as a vendor at `https://vendor.feastpot.co.uk`.
2. Open `https://feastpot.co.uk` in a new tab (same browser).
3. PASS: the customer portal shows the unauthenticated home page, not a vendor session.
4. Sign in as a customer at `https://feastpot.co.uk`.
5. Navigate back to `https://vendor.feastpot.co.uk`.
6. PASS: vendor portal still shows the vendor session (not the customer session).

---

## Real email infrastructure setup (for A1-real and E1-real)

### Option A: Mailosaur (recommended for CI)

1. Create a Mailosaur account at https://mailosaur.com (free tier available).
2. Create a server; note the Server ID (e.g. `abc1defg`).
3. Copy your API Key from the dashboard.
4. Set `TEST_MAILOSAUR_API_KEY` and `TEST_MAILOSAUR_SERVER_ID` in your environment.
5. Configure Supabase custom SMTP to route email to your Mailosaur SMTP server, OR
   configure Resend to forward a copy of emails to a Mailosaur address.

Your Mailosaur inbox address for a given local part: `localpart@<SERVER_ID>.mailosaur.net`.
In test sign-ups, use `a1-<timestamp>@<SERVER_ID>.mailosaur.net` as the email address.

### Option B: Mailpit (local, offline)

1. Install Mailpit: `brew install axllent/apps/mailpit` (macOS) or see https://mailpit.axllent.org.
2. Run Mailpit: `mailpit`.
3. Configure Supabase local dev (not cloud) to use Mailpit as SMTP:
   `supabase/config.toml` > `[auth.email.smtp]` with host `localhost:1025`.
4. Access the Mailpit web UI at `http://localhost:8025`.

Mailpit does not currently have a helper in `apps/web/e2e/auth/helpers/mail.ts`; adapt
the Mailosaur helper to use Mailpit's REST API at `http://localhost:8025/api/v1/messages`.

---

## Known gaps and follow-ups

| Gap | Impact | Priority |
|-----|--------|----------|
| E3 cross-device reset link shows technical PKCE error | Low (user friction) | Low |
| G5 Apple Private Relay multi-account 500 not user-friendly | Medium | Medium |
| A1/E1 real-email tests require Mailosaur setup | None (documented) | None |
| Production rate-limit thresholds not verified end-to-end | Low | Low |
| Vendor portal sign-in form selectors not yet mapped in e2e/auth | None (vendor has own spec) | None |
