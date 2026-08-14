-- RLS coverage gap: tables created after the original enable-rls migration
-- (20260513000000_enable_rls_all_tables) were not covered by it because
-- Prisma creates tables with rowsecurity=false by default and the catch-all
-- DO block in that migration ran before these tables existed.
--
-- Effect: ENABLE + FORCE RLS with no permissive policies = deny-by-default
-- for anon and authenticated. The Prisma/NestJS backend connects as the
-- postgres superuser or service_role, both of which bypass RLS, so the API
-- is unaffected. This is idempotent: enabling RLS on a table that already
-- has it is a no-op.
--
-- Tables covered: every table that appeared in pg_tables with rowsecurity=false
-- on the development database as of 2026-08-14, minus _prisma_migrations which
-- Prisma manages internally and which PostgREST does not expose (leading
-- underscore). Each entry states the migration that created the table.

-- 20260805120000_add_waitlist_recommendations_catering
ALTER TABLE "public"."catering_enquiries"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."catering_enquiries"        FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."postcode_waitlist"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."postcode_waitlist"         FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."vendor_recommendations"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vendor_recommendations"    FORCE  ROW LEVEL SECURITY;

-- 20260806130000_add_terms_versioning / 20260808140000_terms_notice_enhancements
ALTER TABLE "public"."terms_versions"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."terms_versions"            FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."terms_acceptances"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."terms_acceptances"         FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."terms_notices"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."terms_notices"             FORCE  ROW LEVEL SECURITY;

-- 20260806140000_add_order_attribution / 20260811000000_attribution_source_enum
ALTER TABLE "public"."order_attributions"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_attributions"        FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."referral_clicks"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."referral_clicks"           FORCE  ROW LEVEL SECURITY;

-- 20260806150000_add_commission_rate_engine
ALTER TABLE "public"."commission_rates"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."commission_rates"          FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."order_commissions"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_commissions"         FORCE  ROW LEVEL SECURITY;

-- 20260808160000_rate_schedule_entries
ALTER TABLE "public"."rate_schedule_entries"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rate_schedule_entries"     FORCE  ROW LEVEL SECURITY;

-- 20260808170000_vendor_enforcement_actions
ALTER TABLE "public"."vendor_enforcement_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vendor_enforcement_actions" FORCE  ROW LEVEL SECURITY;

-- 20260808180000_dispute_appeals
ALTER TABLE "public"."dispute_appeals"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dispute_appeals"           FORCE  ROW LEVEL SECURITY;

-- 20260808190000_hmrc_tax_profiles
ALTER TABLE "public"."vendor_tax_profiles"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vendor_tax_profiles"       FORCE  ROW LEVEL SECURITY;
ALTER TABLE "public"."platform_reports"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."platform_reports"          FORCE  ROW LEVEL SECURITY;

-- 20260813120000_menu_dishes_screen (internal consolidation log)
ALTER TABLE "public"."_menu_consolidation_log"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."_menu_consolidation_log"   FORCE  ROW LEVEL SECURITY;

-- Vendor referral links (20260801 attribution)
ALTER TABLE "public"."vendor_referral_links"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vendor_referral_links"     FORCE  ROW LEVEL SECURITY;

-- Defensive catch-all: any table added in a future migration that is still
-- missing RLS at deploy time. Skips _prisma_migrations. Idempotent.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', r.relname);
    RAISE NOTICE '[rls-gap] enabled on public.%', r.relname;
  END LOOP;
END
$$;
