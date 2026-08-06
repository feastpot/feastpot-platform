# Supabase custom access token hook

Feastpot expects each Supabase JWT to carry a `role` claim drawn from `public.users.role`. Register the following hook in **Supabase Dashboard → Authentication → Hooks → Custom Access Token Hook**.

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

  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{role}', to_jsonb(user_role));
  ELSE
    claims := jsonb_set(claims, '{role}', '"customer"');
  END IF;

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
-- back to '"customer"' for EVERYONE, and vendors/admins get a customer JWT.
DROP POLICY IF EXISTS "Allow auth admin to read user roles" ON public.users;
CREATE POLICY "Allow auth admin to read user roles"
  ON public.users
  AS PERMISSIVE FOR SELECT
  TO supabase_auth_admin
  USING (true);
```

After creating the function, register it: **Auth → Hooks → Custom Access Token Hook → public.custom_access_token_hook**. Newly issued JWTs will then carry a top-level `role` claim, which `SupabaseAuthGuard.mapUser` reads from the verified bearer token.

> **Important - this hook is not managed by Prisma.** The function, its grants,
> and the RLS policy above live only in the database. A schema reset / fresh
> `prisma db push` against a new database drops them. When that happens **every**
> sign-in returns HTTP 500 (`Error running hook URI: pg-functions://postgres/public/custom_access_token_hook`),
> or - if only the policy is missing - logins succeed but every JWT carries
> `role: customer`. Re-run the full SQL block above after any DB reset.

## Trust model

`mapUser` sources the role from, in order:

1. The top-level `role` claim of the verified JWT (set by this hook).
2. `user.app_metadata.role` (server-managed, set via the admin API only).

`user_metadata.role` is **never** trusted - that field is writable by the user themselves and would allow privilege escalation.
