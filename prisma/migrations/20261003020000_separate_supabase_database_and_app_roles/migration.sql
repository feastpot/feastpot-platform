-- Supabase Storage/PostgREST SET ROLE using the reserved JWT `role` claim.
-- App roles are not PostgreSQL roles and must never be put in that claim.
-- CREATE OR REPLACE preserves the existing hook registration and grants.
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

-- Fresh databases may not previously have had the hook installed. Test/CI
-- PostgreSQL does not necessarily define Supabase's auth-admin role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT SELECT (id, role) ON public.users TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'users'
        AND policyname = 'Allow auth admin to read user roles'
    ) THEN
      CREATE POLICY "Allow auth admin to read user roles"
        ON public.users FOR SELECT TO supabase_auth_admin USING (true);
    END IF;
  END IF;
END;
$$;