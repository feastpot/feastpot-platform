---
name: Supabase custom access token hook (login dependency)
description: Why all logins can break (HTTP 500 or wrong role) after a DB reset, and the complete fix.
---
# Supabase custom_access_token_hook - login depends on it

Supabase Auth is configured (dashboard → Auth → Hooks) to call
`public.custom_access_token_hook(jsonb)` on every token issuance. The app's
`SupabaseAuthGuard.mapUser` trusts the JWT's top-level `role` claim FIRST
(then `app_metadata.role`). That claim is injected by this hook, which reads
`public.users.role`.

**Why this bites:** the function, its grants, and an RLS policy live ONLY in the
database - Prisma does not manage them. A schema reset / fresh `prisma db push`
onto a new DB drops them. Symptoms:
- Function missing → EVERY sign-in returns HTTP 500:
  `Error running hook URI: pg-functions://postgres/public/custom_access_token_hook`.
- Function present but RLS policy missing → logins succeed but every JWT gets
  `role: customer` (hook runs as `supabase_auth_admin`, which is subject to
  RLS-forced `public.users` and reads zero rows → falls back to customer).
  Vendors/admins then get 403 on role-gated API routes.

**How to apply / full fix:** re-run the complete SQL in
`docs/supabase-auth-hook.md` - it now includes the function, `GRANT USAGE ON
SCHEMA public` + `GRANT SELECT ON public.users` + `GRANT EXECUTE` to
`supabase_auth_admin`, AND the `"Allow auth admin to read user roles"` RLS
policy. All four pieces are required.
