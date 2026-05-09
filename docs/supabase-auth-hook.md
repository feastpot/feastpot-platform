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

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
```

After creating the function, register it: **Auth → Hooks → Custom Access Token Hook → public.custom_access_token_hook**. Newly issued JWTs will then carry a top-level `role` claim, which `SupabaseAuthGuard.mapUser` reads from the verified bearer token.

## Trust model

`mapUser` sources the role from, in order:

1. The top-level `role` claim of the verified JWT (set by this hook).
2. `user.app_metadata.role` (server-managed, set via the admin API only).

`user_metadata.role` is **never** trusted — that field is writable by the user themselves and would allow privilege escalation.
