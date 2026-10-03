---
name: Supabase custom access token hook (login dependency)
description: Why all logins can break (HTTP 500 or wrong role) after a DB reset, and the complete fix.
---
# Supabase custom_access_token_hook - login depends on it

Supabase Auth is configured (dashboard → Auth → Hooks) to call
`public.custom_access_token_hook(jsonb)` on every token issuance. The app's
Keep Supabase's reserved JWT `role` as `authenticated`. Store Feastpot's application role in a separate signed `app_role` claim. Never create PostgreSQL vendor/customer/staff roles to accommodate application claims.

**Why:** Supabase Storage and PostgREST interpret JWT `role` as a PostgreSQL role. Application-role claims caused authenticated private reads to return database HTTP 500 before RLS ran.

**How to apply:** keep the API reader compatible with old signed application-role tokens during rollover. Deploy that reader before changing a live hook; existing tokens require refresh for Storage to use the corrected database role. Private Storage remains API-proxy-only, including for owners.

Automatic migrations must stage new auth-hook implementations without switching the registered live hook. Activate only after checking a capability from the actual running API, not merely a successful build.

**Why:** GitHub database migration and VM startup migration run before the manual API publish. A migration that switches claims immediately can issue new-format tokens to an old reader.

**How to apply:** keep activation separate and read-only by default, match the API's Supabase project to the database target, and require explicit production approval for activation.

Managed Supabase may deny the database owner `SET ROLE supabase_auth_admin`.

**Why:** the Auth role is managed and the database owner's connection is not necessarily a member. Do not grant membership merely to make an impersonation test pass.

**How to apply:** inspect function/column permissions and the auth-admin RLS policy, test SQL contracts transactionally, and use real Supabase-issued sessions for end-to-end Auth verification.

**Why recovery still matters:** Supabase Dashboard hook registration is external configuration. Missing SQL hook objects or auth-admin permissions after a database recovery can break token issuance. Symptoms:
- Function missing → EVERY sign-in returns HTTP 500:
  `Error running hook URI: pg-functions://postgres/public/custom_access_token_hook`.
- Function present but RLS policy missing → logins succeed but every JWT gets
  `app_role: customer` (hook runs as `supabase_auth_admin`, which is subject to
  RLS-forced `public.users` and reads zero rows → falls back to customer).
  Vendors/admins then get 403 on role-gated API routes.

**Hook recovery:** re-run the complete SQL in
`docs/supabase-auth-hook.md` - it now includes the function, `GRANT USAGE ON
SCHEMA public` + `GRANT SELECT ON public.users` + `GRANT EXECUTE` to
`supabase_auth_admin`, AND the `"Allow auth admin to read user roles"` RLS
policy. All four pieces are required. SQL migrations now version the hook, but Supabase Dashboard registration is still external configuration.
