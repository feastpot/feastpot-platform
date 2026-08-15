# Password Reset – Test Checklist

This document covers the full password-reset journey for both the customer
(`feastpot.co.uk`) and vendor (`vendors.feastpot.co.uk`) apps.

Mark each case PASS, FAIL, or BLOCKED when testing. Record evidence (screenshot,
network-tab URL, response body) in the Evidence column.

---

## Legend

| Symbol    | Meaning                                                 |
| --------- | ------------------------------------------------------- |
| ✅ PASS   | Works as expected                                       |
| ❌ FAIL   | Does not work; needs a fix                              |
| ⏸ BLOCKED | Cannot test (e.g. DNS not configured, feature flag off) |
| -         | Not yet tested                                          |

---

## Pre-flight checklist (manual, one-time)

| #   | Check                                                                                 | Status | Evidence |
| --- | ------------------------------------------------------------------------------------- | ------ | -------- |
| P1  | SPF record present on `feastpot.co.uk` (e.g. via MXToolbox)                           | -      |          |
| P2  | DKIM record present and verified in Resend dashboard                                  | -      |          |
| P3  | DMARC record present (`_dmarc.feastpot.co.uk`)                                        | -      |          |
| P4  | Resend SMTP configured in Supabase cloud dashboard (Authentication → Settings → SMTP) | -      |          |
| P5  | Supabase OTP expiry set to 3600s in cloud dashboard                                   | -      |          |
| P6  | Leaked-password check enabled in Supabase dashboard (Authentication → Settings)       | -      |          |
| P7  | `VENDOR_PORTAL_URL` secret set to the vendor portal production URL                    | -      |          |
| P8  | `NEXT_PUBLIC_WEB_URL` env var set in API/Replit env                                   | -      |          |

---

## 1 – Forgot-password page (customer app)

| #   | Scenario                                                     | Expected                                                                        | Status | Evidence |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------ | -------- |
| 1.1 | Submit a registered email                                    | Page immediately shows "Check your email"; no indication of registration status | -      |          |
| 1.2 | Submit an unregistered email                                 | Same "Check your email" page (no error, no difference)                          | -      |          |
| 1.3 | Submit a blank email                                         | Browser/HTML5 validation prevents submission                                    | -      |          |
| 1.4 | Submit a malformed email (no `@`)                            | Browser/HTML5 validation prevents submission                                    | -      |          |
| 1.5 | Submit the same registered email 4× within 1 hour            | 4th attempt still shows "Check your email" (silent rate limit; no error)        | -      |          |
| 1.6 | Submit from the same IP more than 5× per minute              | 6th attempt gets HTTP 429 from the API; page should still show generic state    | -      |          |
| 1.7 | Observe network response time for registered vs unregistered | Both respond in ≥ 800ms (timing normalized)                                     | -      |          |

---

## 2 – Forgot-password page (vendor portal)

| #   | Scenario                                                             | Expected                                               | Status | Evidence |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------ | ------ | -------- |
| 2.1 | Submit a registered vendor email                                     | "Check your email" page                                | -      |          |
| 2.2 | Submit an unregistered email                                         | Same "Check your email" page                           | -      |          |
| 2.3 | `app` field in request body is `"vendor"`                            | Confirm in network tab                                 | -      |          |
| 2.4 | Reset email link opens vendor portal interstitial (not customer app) | URL contains `vendors.feastpot.co.uk/auth/reset/start` | -      |          |

---

## 3 – Reset email

| #   | Scenario                                                                      | Expected                                         | Status | Evidence |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------ | ------ | -------- |
| 3.1 | Email arrives in inbox within 2 minutes                                       | -                                                | -      |          |
| 3.2 | Email renders correctly in Gmail                                              | Branded header, button visible, no broken images | -      |          |
| 3.3 | Email renders correctly in Outlook                                            | VML button renders; no raw code visible          | -      |          |
| 3.4 | Email renders correctly in Apple Mail                                         | -                                                | -      |          |
| 3.5 | Reset link in email goes to `/auth/reset/start#…` (fragment, not query param) | URL bar shows `#` not `?token=`                  | -      |          |
| 3.6 | Email passes SPF/DKIM/DMARC (check headers or mail-tester.com score ≥ 9)      | -                                                | -      |          |
| 3.7 | Email does not contain an unsubscribe link                                    | -                                                | -      |          |

---

## 4 – Scanner-proof interstitial (`/auth/reset/start`)

| #   | Scenario                                                     | Expected                                                                  | Status | Evidence |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------- | ------ | -------- |
| 4.1 | Load page via email link (with fragment)                     | Shows "Set new password" button; does NOT auto-redirect                   | -      |          |
| 4.2 | Load page with no fragment (`/auth/reset/start` directly)    | Shows "not valid / link is missing" state                                 | -      |          |
| 4.3 | Load page with a non-HTTPS fragment (`#http://evil.example`) | Shows "not valid" state                                                   | -      |          |
| 4.4 | Load page with a malformed fragment (random string)          | Shows "not valid" state                                                   | -      |          |
| 4.5 | Click "Set new password"                                     | Browser navigates to the Supabase ConfirmationURL (token exchange starts) | -      |          |
| 4.6 | Click "Request a new link" on the invalid state              | Navigates to `/forgot-password`                                           | -      |          |

---

## 5 – Auth callback (`/auth/callback?type=recovery&next=/auth/reset/update`)

| #   | Scenario                                                         | Expected                                                            | Status | Evidence |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------- | ------ | -------- |
| 5.1 | Valid code, type=recovery                                        | Session set; redirected to `/auth/reset/update`                     | -      |          |
| 5.2 | Valid code, type=recovery, `next` overridden to `/account`       | Still redirected to `/auth/reset/update` (forced for recovery type) | -      |          |
| 5.3 | Invalid/expired code                                             | Redirected to `/sign-in?error=…`                                    | -      |          |
| 5.4 | No code in URL                                                   | Redirected to `/`                                                   | -      |          |
| 5.5 | users/sync API call is skipped on recovery flow                  | Confirm in API logs: no `POST /v1/users/sync` during password reset | -      |          |
| 5.6 | Vendor callback: valid code → redirected to `/auth/reset/update` | -                                                                   | -      |          |

---

## 6 – New-password form (`/auth/reset/update`)

| #   | Scenario                                            | Expected                                                                     | Status | Evidence |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------- | ------ | -------- |
| 6.1 | Page loads after valid callback                     | Form shown with password rules visible above the inputs                      | -      |          |
| 6.2 | Submit valid password (≥8 chars, matching)          | Success state shown ("Password updated")                                     | -      |          |
| 6.3 | Submit password < 8 characters                      | Inline validation error before API call                                      | -      |          |
| 6.4 | Submit password > 72 characters                     | Inline validation error before API call                                      | -      |          |
| 6.5 | Submit mismatched passwords                         | "Passwords do not match" error                                               | -      |          |
| 6.6 | Submit same password as existing                    | Supabase error surfaced ("should be different from old password") if enabled | -      |          |
| 6.7 | Hit submit with no session (link expired)           | Supabase error surfaced to user                                              | -      |          |
| 6.8 | Success → verify `signOut({ scope: 'others' })` ran | Open a second browser tab that was signed in; it should require re-auth      | -      |          |
| 6.9 | After success, "Go to Feastpot" link works          | Navigates to home                                                            | -      |          |

---

## 7 – Password-changed notification email

| #   | Scenario                                                                    | Expected                                                   | Status | Evidence |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------- | ------ | -------- |
| 7.1 | Password changed successfully                                               | Confirmation email arrives within 2 minutes                | -      |          |
| 7.2 | Email renders correctly (subject line, brand header, "not you?" alert box)  | -                                                          | -      |          |
| 7.3 | Email does not contain a reset link or action button (purely informational) | -                                                          | -      |          |
| 7.4 | If RESEND_API_KEY is absent (stub mode)                                     | API logs a warn; password change still completes; no crash | -      |          |
| 7.5 | Notify endpoint called without auth header                                  | Returns 401 Unauthorized                                   | -      |          |

---

## 8 – Security / edge cases

| #   | Scenario                                                             | Expected                                                                                  | Status | Evidence |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ | -------- |
| 8.1 | Replay the reset link after it has been used once                    | Supabase 400/422; user sees an error state                                                | -      |          |
| 8.2 | Use a 61-minute-old link (after 3600s expiry)                        | Supabase rejects token; user sees error state                                             | -      |          |
| 8.3 | Open `/auth/reset/update` directly without completing the reset flow | `updateUser` returns "Auth session missing" or similar error                              | -      |          |
| 8.4 | `POST /v1/auth/reset-request` with `app: 'evil'`                     | API returns 400 validation error                                                          | -      |          |
| 8.5 | `POST /v1/auth/reset-request` with no body                           | API returns 400 validation error                                                          | -      |          |
| 8.6 | `next` param on `/auth/callback` set to `//evil.example`             | `safeRedirect` blocks it; falls back to home or /auth/reset/update                        | -      |          |
| 8.7 | `next` param set to `https://evil.example`                           | Blocked by `safeRedirect`                                                                 | -      |          |
| 8.8 | Reset link copied and opened in a different browser                  | Supabase handles code-for-session atomically; only the tab that opens it gets the session | -      |          |

---

## 9 – Vendor portal specifics

| #   | Scenario                                                                    | Expected                                                       | Status | Evidence |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------- | ------ | -------- |
| 9.1 | `/auth/callback` (vendor) is not blocked by middleware                      | Route is in the public allowlist; accessible without a session | -      |          |
| 9.2 | `/auth/reset/start` (vendor) is not blocked by middleware                   | Same                                                           | -      |          |
| 9.3 | `/auth/reset/update` (vendor) is not blocked by middleware                  | Same                                                           | -      |          |
| 9.4 | Vendor reset form matches vendor branding (teal, `bg-surface`, vendor logo) | No customer-app brand colours leaked                           | -      |          |

---

## 10 – Outstanding manual actions (not automated)

These must be completed by the team before the feature goes live. They cannot
be automated from code.

| #   | Action                                                                                                         | Owner          | Done? |
| --- | -------------------------------------------------------------------------------------------------------------- | -------------- | ----- |
| M1  | Add SPF record to `feastpot.co.uk` DNS                                                                         | DNS admin      | -     |
| M2  | Add DKIM record (from Resend dashboard) to DNS                                                                 | DNS admin      | -     |
| M3  | Add DMARC record (`v=DMARC1; p=none; rua=mailto:dmarc@feastpot.co.uk`) to DNS                                  | DNS admin      | -     |
| M4  | Configure Resend SMTP in Supabase cloud dashboard                                                              | Platform admin | -     |
| M5  | Set OTP expiry to 3600s in Supabase cloud dashboard                                                            | Platform admin | -     |
| M6  | Enable leaked-password check in Supabase dashboard                                                             | Platform admin | -     |
| M7  | Set `VENDOR_PORTAL_URL` secret in Replit environment                                                           | Platform admin | -     |
| M8  | Configure custom email template URLs in Supabase cloud dashboard (point to `supabase/templates/recovery.html`) | Platform admin | -     |
