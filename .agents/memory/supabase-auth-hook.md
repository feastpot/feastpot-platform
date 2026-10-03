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
