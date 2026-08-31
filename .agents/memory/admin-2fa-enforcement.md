---
name: Admin 2FA enforcement (ADMIN_REQUIRE_AAL2)
description: How the AAL-based staff 2FA gate works, where each layer lives, and the critical two-mode enrolment/challenge distinction.
---

# Admin 2FA enforcement

## Flag
Production requires `ADMIN_REQUIRE_AAL2=true` for the API and both `ADMIN_REQUIRE_AAL2=true` plus `NEXT_PUBLIC_ADMIN_REQUIRE_AAL2=true` for the admin app. Missing, false, or differently cased values fail closed. Enrol every staff account before setting the flags.

**Why:** An optional flag silently reduced privileged access to password-only authentication when a deployment variable was omitted.

**How to apply:** Keep `/settings/2fa` reachable for authenticated enrolment/challenge, but do not let any other privileged route or production release proceed unless the required flags are exactly `true`.

## Three gate layers (belt-and-suspenders)
1. **Middleware** (`apps/admin/src/middleware.ts`): after `getUser()`, calls `getSession()` to read the JWT, decodes `aal` with `atob()` (edge-safe). Redirects aal1 to `/settings/2fa?next=<original>`. Allowlist: `/settings/2fa`, `/sign-in`, `/unauthorized`.
2. **Server gate** (`apps/admin/src/lib/auth/server-gate.ts`): `requireStaff()` decodes aal via `Buffer.from(payload, 'base64url')`. Redirects to `/settings/2fa?next=<original>`. The `/settings/2fa` page itself passes `{ skipAalCheck: true }` to avoid a loop.
3. **API NestJS** (`apps/api/src/auth/guards/aal.guard.ts`): global APP_GUARD; reads `request.user.aal` (already populated by SupabaseAuthGuard); only applies when the endpoint has a `@Roles(admin|support|finance|compliance)` decorator. Throws `ForbiddenException({ code: 'AAL2_REQUIRED' })`.

## Two modes on /settings/2fa
- **No enrolled factor (aal1, no factor)**: show `SecuritySection` (full enrolment flow — QR, verify, recovery codes).
- **Factor exists but aal1 (fresh sign-in after enrolment)**: show `ChallengeCard` — `mfa.challenge()` + `mfa.verify()` upgrades session to aal2, then `router.push(next)`.
Both modes end with `onEnrolled()` / redirect to `next`.

## SecuritySection callback
`SecuritySection({ onEnrolled?: () => void })` — `onEnrolled` is called after `verifyAndActivate()` succeeds. The `/settings/2fa` client passes `handleEnrolled` which does `router.push(next)`.

## Factor removal / downgrade timing
Removing a TOTP factor in the Supabase Dashboard does NOT immediately downgrade the existing aal2 JWT. The JWT retains aal2 until the next token refresh (up to 1 hour). For immediate revocation, a Supabase admin must also "Invalidate all sessions" from the user detail panel.

**Why:** Supabase's `getUser()` validates the token server-side but does NOT force a new token to be issued. Token replacement happens only on natural expiry or explicit session invalidation.

## Recovery docs
`docs/2fa-recovery.md` — FOUNDER ACTION runbook for factor removal and re-enrolment.

## Release enforcement
The API asserts the production flag before Nest creates a listener. The production deployment workflow validates both API and admin flag surfaces before migrations or frontend deploy hooks run.
