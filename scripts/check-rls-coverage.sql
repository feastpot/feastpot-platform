-- CI guard: fail if any table in the public schema has rowsecurity=false.
--
-- Usage (run from CI after migrate deploy):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-rls-coverage.sql
--
-- Allowlist (must have an explicit justification comment for each entry):
--   _prisma_migrations  -- Prisma internal; not exposed by PostgREST (leading
--                          underscore); managed entirely by Prisma CLI.
--
-- If a table genuinely must be public (e.g. a reference table readable by
-- anon), do NOT add it here. Enable RLS and add a narrow SELECT policy
-- instead. This list is for tables PostgREST cannot reach regardless.

DO $$
DECLARE
  bad_tables text[];
  tbl text;
BEGIN
  SELECT array_agg(tablename ORDER BY tablename)
  INTO bad_tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false
    AND tablename NOT IN (
      '_prisma_migrations'   -- Prisma internal; PostgREST ignores underscore tables
    );

  IF bad_tables IS NOT NULL AND array_length(bad_tables, 1) > 0 THEN
    FOREACH tbl IN ARRAY bad_tables LOOP
      RAISE WARNING 'EXPOSED: public.% has rowsecurity=false', tbl;
    END LOOP;
    RAISE EXCEPTION
      'RLS coverage check failed: % table(s) in public schema have rowsecurity=false: %. '
      'Enable RLS in a migration and add it to the allowlist in scripts/check-rls-coverage.sql '
      'with a justification comment only if PostgREST truly cannot reach it.',
      array_length(bad_tables, 1),
      array_to_string(bad_tables, ', ');
  ELSE
    RAISE NOTICE 'RLS coverage check passed: all public tables have rowsecurity=true.';
  END IF;
END
$$;
