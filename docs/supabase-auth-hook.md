# Supabase custom access token hook

Feastpot expects each Supabase JWT to carry an `app_role` claim drawn from `public.users.role`. The reserved `role` claim must remain `authenticated`: Supabase Storage and PostgREST use it as a PostgreSQL role. Putting `vendor`, `customer` or staff roles there causes database errors, not ordinary access denials.

Register the following hook in **Supabase Dashboard → Authentication → Hooks → Custom Access Token Hook**.

For an existing production installation, follow [the gated two-phase rollout](security/storage-hook-production-rollout.md), not an ungated execution of this recovery SQL.

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  claims jsonb;
  user_role text;
BEGIN
  SELECT role::text INTO user_role
  FROM public.users
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  claims := jsonb_set(claims, '{role}', '"authenticated"'::jsonb);
  claims := jsonb_set(claims, '{app_role}', to_jsonb(COALESCE(user_role, 'customer')));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- The hook executes as the `supabase_auth_admin` role, so it needs to reach
-- public.users. EXECUTE alone is NOT enough:
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT (id, role) ON public.users TO supabase_auth_admin;

-- public.users has RLS enabled (and forced), so supabase_auth_admin would read
-- ZERO rows without an explicit policy. Without this the hook silently falls
-- back to app_role '"customer"' for EVERYONE.
DROP POLICY IF EXISTS "Allow auth admin to read user roles" ON public.users;
CREATE POLICY "Allow auth admin to read user roles"
  ON public.users
  AS PERMISSIVE FOR SELECT
  TO supabase_auth_admin
  USING (true);
```

After creating the function, register it: **Auth → Hooks → Custom Access Token Hook → public.custom_access_token_hook**. Newly issued JWTs carry `role: authenticated` and the separate top-level `app_role`, which `SupabaseAuthGuard.mapUser` reads from the verified bearer token.

> **Important:** the SQL migration stages an inactive implementation; a separate gated activation updates the registered hook. Supabase Dashboard registration remains external configuration and is not created by Prisma. A database reset can still remove the function, grants or auth-admin RLS policy. When that happens **every**
> sign-in returns HTTP 500 (`Error running hook URI: pg-functions://postgres/public/custom_access_token_hook`),
> or - if only the policy is missing - logins succeed but every JWT carries
> `app_role: customer`. Re-run the full SQL block above after recovery if necessary. Never use `db push` on shared databases.

## Trust model

`mapUser` sources the role from, in order:

1. The top-level `app_role` claim of the verified JWT (set by this hook).
2. A legacy top-level application `role` claim, only for existing sessions during rollover.
3. `user.app_metadata.role` (server-managed, set via the admin API only).

`user_metadata.role` is **never** trusted - that field is writable by the user themselves and would allow privilege escalation.

## Rollout and private Storage boundary

The migration stages only: it may run safely before the manual API publish. Deploy the compatible API role reader, then use `npm run rollout:storage-hook -- --api-url <verified-production-origin>` for the read-only gate. Activation additionally requires `--apply` and explicit production approval; it preserves the existing Dashboard registration. See [the release sequence](security/storage-hook-production-rollout.md).

Existing tokens keep their original signed claims until refreshed or reissued. API authorisation stays compatible, but old tokens can still produce the Storage 500 until session refresh. Do not revoke all sessions merely to accelerate rollover.

Private document access stays through the authenticated API proxy, using its ownership/staff checks and server-side Storage credentials. Do not add PostgreSQL application roles, make the bucket public, or add permissive Storage policies. Even an owner is intentionally denied direct private Storage reads; normal masked not-found responses are expected. Public image reads remain public.
