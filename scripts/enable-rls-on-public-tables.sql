-- Post-migration safety hook: enable Row-Level Security on every table
-- in the `public` schema that doesn't already have it.
--
-- Why: Prisma migrations create tables with RLS disabled by default,
-- which exposes them through Supabase's auto-generated PostgREST API
-- to anyone holding the anon key (i.e. every browser visitor). Our
-- backend connects with a role that bypasses RLS, so enabling RLS
-- without any policies = deny-by-default for anon/authenticated
-- without affecting our API.
--
-- Idempotent — safe to run on every deploy. Skips `_prisma_migrations`
-- (Prisma manages that table and may use it under its own role).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    RAISE NOTICE '[rls] enabled on public.%', r.tablename;
  END LOOP;
END
$$;
