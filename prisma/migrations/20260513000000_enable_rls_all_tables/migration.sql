-- Enable Row Level Security on every table in the public schema.
--
-- Context: the Feastpot API connects to Postgres directly via SUPABASE_DB_URL
-- using a privileged role that bypasses RLS (postgres / service-role). All
-- application reads/writes go through that API. The Supabase anon key, which
-- is shipped to the customer/vendor/admin frontends, must NOT have any direct
-- access to these tables via PostgREST.
--
-- Strategy: ENABLE (and FORCE) RLS on every table without creating any
-- permissive policies. With RLS enabled and no policies, the `anon` and
-- `authenticated` roles get an implicit deny on all rows. The `postgres`
-- superuser used by Prisma bypasses RLS regardless, and the Supabase
-- `service_role` is granted BYPASSRLS by Supabase, so the API keeps working.
-- FORCE RLS additionally ensures that even if a table is later owned by a
-- non-superuser role, the deny-by-default behaviour still applies.

ALTER TABLE "public"."users"                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users"                      FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."sessions"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sessions"                   FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."addresses"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."addresses"                  FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."push_subscriptions"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."push_subscriptions"         FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications"              FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."vendors"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vendors"                    FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."menus"                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."menus"                      FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."menu_items"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."menu_items"                 FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."delivery_configs"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."delivery_configs"           FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."vendor_documents"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vendor_documents"           FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs"                 FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."orders"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."orders"                     FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."order_items"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_items"                FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."event_enquiries"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_enquiries"            FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."event_quotes"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_quotes"               FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."disputes"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."disputes"                   FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."dispute_evidence"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dispute_evidence"           FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."payments"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payments"                   FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."payouts"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payouts"                    FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."processed_webhook_events"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."processed_webhook_events"   FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."reviews"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reviews"                    FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."loyalty_points"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."loyalty_points"             FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."referrals"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."referrals"                  FORCE  ROW LEVEL SECURITY;

-- Defensive catch-all: enable RLS on any other ordinary table that may exist
-- in the public schema but isn't managed by Prisma (e.g. `_prisma_migrations`,
-- or tables created manually via the Supabase SQL editor). Skips views,
-- partitions, and foreign tables. Safe to re-run.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid, n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.nspname, r.relname);
    EXECUTE format('ALTER TABLE %I.%I FORCE  ROW LEVEL SECURITY', r.nspname, r.relname);
  END LOOP;
END
$$;
