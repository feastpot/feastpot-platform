-- Execute only through the gated rollout command, inside one transaction.
-- Keep the registered hook name and its existing ACL/Dashboard registration.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT public.custom_access_token_hook_v2(event);
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- Fail/roll back if the staged implementation does not preserve Supabase's
-- reserved database role and the safe unknown-user application-role fallback.
DO $$
DECLARE
  claims jsonb;
BEGIN
  claims := public.custom_access_token_hook(
    '{"user_id":"00000000-0000-0000-0000-000000000000","claims":{"role":"authenticated"}}'::jsonb
  )->'claims';
  IF claims->>'role' IS DISTINCT FROM 'authenticated'
     OR claims->>'app_role' IS DISTINCT FROM 'customer' THEN
    RAISE EXCEPTION 'Token hook contract validation failed';
  END IF;
END;
$$;