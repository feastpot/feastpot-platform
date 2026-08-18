# Admin 2FA Recovery -- FOUNDER ACTION

## What this covers

When a staff member loses access to their authenticator app (phone lost, app deleted, factory
reset), they cannot complete the TOTP challenge and are locked out of the admin console.
This is the intended security behaviour. Recovery requires a founder/owner action in the
Supabase Dashboard.

## Removing the lost factor

1. Log in to the Supabase Dashboard: https://supabase.com/dashboard/project/yeklvhpuimgjbrsfcqmq
2. Go to **Authentication -- Users**.
3. Find the affected staff member's account by email.
4. Click their row to open the user detail panel.
5. Under **Multi-Factor Authentication**, click **Remove factor** next to their TOTP entry.
6. Confirm the removal.

The staff member can now sign in with password only (aal1). Because their session JWT retains
the aal2 claim until it expires (up to 1 hour), you may also want to invalidate their existing
sessions:

7. Still in the user detail panel, click **Invalidate all sessions**.

After that, the staff member signs in again (they will land on `/settings/2fa` because
ADMIN_REQUIRE_AAL2 requires aal2) and completes fresh enrolment.

## Important notes

- **Genuine hard bounces re-suppress.** This document is about 2FA, not email suppression.
- **Re-enrolment path.** After factor removal the staff member visits `/settings/2fa`, scans
  a new QR code, verifies a code, and is issued 10 new recovery codes. Tell them to save those
  codes somewhere safe (password manager, printed copy in a secure location).
- **Recovery codes.** If the staff member still has an unused recovery code from their original
  enrolment, they can use it at the Supabase sign-in screen to bypass the TOTP challenge and
  land in the admin console at aal2. Recovery codes work even without the authenticator app.
  Each code is single-use.
- **Timing of JWT downgrade.** When a factor is removed, the user's existing JWT retains its
  aal2 claim until the next token refresh (up to 1 hour). Step 7 (invalidate sessions) makes
  revocation immediate. For routine re-enrolment after a planned device change, step 7 is not
  needed -- just remove the factor and let the staff member re-enrol.
- **Flag off.** If ADMIN_REQUIRE_AAL2 is off (dev environment), staff can log in without 2FA
  and the 2FA page still works for voluntary enrolment.
