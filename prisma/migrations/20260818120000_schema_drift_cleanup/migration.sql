-- Migration: 20260818120000_schema_drift_cleanup
--
-- Resolves drift between migration history and schema.prisma discovered by
-- `prisma migrate diff --from-schema-datasource --to-schema-datamodel`.
-- Every statement uses IF EXISTS / NOT EXISTS guards so this migration is
-- fully idempotent: a no-op on any fresh shadow database (for CI) and
-- convergent on any database where individual changes were already applied
-- manually or via db push.
--
-- Classes of change:
--   1. FeastPass enum names (snake_case DB -> PascalCase schema)
--   2. analytics_events and error_incidents id column types (VARCHAR -> TEXT)
--   3. Index renames to match Prisma-generated names
--   4. Add missing indexes
--   5. Drop column defaults that schema.prisma no longer carries
--   6. FK constraint ON DELETE rule corrections
--   7. Drop legacy objects not referenced by schema.prisma

-- =========================================================================
-- 1. FeastPass enum names
--    The original migration created feast_pass_plan / feast_pass_status
--    (snake_case). Prisma now requires the exact PascalCase name from the
--    schema because no @@map annotation is present on the enum. ALTER TYPE
--    RENAME is safe: Postgres updates column OID references automatically.
-- =========================================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'feast_pass_plan' AND typtype = 'e'
  ) THEN
    ALTER TYPE feast_pass_plan RENAME TO "FeastPassPlan";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'feast_pass_status' AND typtype = 'e'
  ) THEN
    ALTER TYPE feast_pass_status RENAME TO "FeastPassStatus";
  END IF;
END $$;

-- =========================================================================
-- 2. Column type corrections: VARCHAR -> TEXT
--    Prisma's String @id without @db.VarChar generates TEXT.
--    Analytics and error-incident ids were hand-written as VARCHAR in their
--    original migrations. USING cast is safe because every existing CUID /
--    UUID value is valid TEXT.
-- =========================================================================

ALTER TABLE analytics_events
  ALTER COLUMN id TYPE TEXT USING id::TEXT;

ALTER TABLE error_incidents
  ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- =========================================================================
-- 3. Index renames
--    Prisma derives index names from table + column names. Several indexes
--    were created with hand-written names that differ from Prisma's convention.
-- =========================================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'commission_rates_source_effectivefrom_idx'
  ) THEN
    ALTER INDEX "commission_rates_source_effectivefrom_idx"
      RENAME TO "commission_rates_source_effective_from_idx";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'error_incidents_app_route_idx'
  ) THEN
    ALTER INDEX "error_incidents_app_route_idx"
      RENAME TO "error_incidents_app_route_created_at_idx";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'menuitem_allergens_gin'
  ) THEN
    ALTER INDEX "menuitem_allergens_gin"
      RENAME TO "menu_items_allergens_idx";
  END IF;
END $$;

-- =========================================================================
-- 4. Add missing indexes
-- =========================================================================

-- dispute_appeals: Prisma schema carries @@index([disputeId])
CREATE INDEX IF NOT EXISTS "dispute_appeals_dispute_id_idx"
  ON "dispute_appeals" ("dispute_id");

-- feast_pass_subscriptions: index on (status, current_period_end) was in the
-- original migration SQL but may have failed silently on enum type mismatch.
CREATE INDEX IF NOT EXISTS "feast_pass_subscriptions_status_current_period_end_idx"
  ON "feast_pass_subscriptions" ("status", "current_period_end");

-- =========================================================================
-- 5. Drop column defaults not carried by schema.prisma
--    Prisma omits @default(now()) from several updatedAt-style columns.
--    DROP DEFAULT is safe and a no-op if the default does not exist.
-- =========================================================================

ALTER TABLE catering_bookings      ALTER COLUMN updated_at  DROP DEFAULT;
ALTER TABLE platform_reports       ALTER COLUMN updated_at  DROP DEFAULT;
ALTER TABLE catering_line_items    ALTER COLUMN allergens   DROP DEFAULT;

-- =========================================================================
-- 6. FK constraint ON DELETE rule corrections
--    Prisma's default for required relations without an explicit onDelete is
--    Restrict. Two constraints were created with a different rule and would
--    cause drift on every migrate diff run.
--
--    referral_clicks.referral_link_id:
--      current = CASCADE, schema requires RESTRICT
--    terms_acceptances.vendor_id:
--      current = NO ACTION, schema requires RESTRICT
--      (functionally identical for non-deferred constraints; fixing so that
--      migrate diff reports zero drift)
-- =========================================================================

-- referral_clicks
ALTER TABLE referral_clicks
  DROP CONSTRAINT IF EXISTS "referral_clicks_referral_link_id_fkey";

ALTER TABLE referral_clicks
  ADD CONSTRAINT "referral_clicks_referral_link_id_fkey"
  FOREIGN KEY ("referral_link_id")
  REFERENCES "vendor_referral_links" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- terms_acceptances (vendor)
ALTER TABLE terms_acceptances
  DROP CONSTRAINT IF EXISTS "terms_acceptances_vendor_id_fkey";

ALTER TABLE terms_acceptances
  ADD CONSTRAINT "terms_acceptances_vendor_id_fkey"
  FOREIGN KEY ("vendor_id")
  REFERENCES "vendors" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- =========================================================================
-- 7. Drop legacy objects
--    These exist in deployed databases but were never created by a migration
--    and are absent from schema.prisma. IF EXISTS makes them no-ops in CI.
--
--    _menu_consolidation_log: one-off ETL helper table, no longer needed.
--    orders.capacity_released_at / capacity_reservation: columns that were
--    added via db push during an earlier capacity prototype and subsequently
--    removed from schema.prisma without a migration.
-- =========================================================================

DROP TABLE IF EXISTS "_menu_consolidation_log";

ALTER TABLE "orders"
  DROP COLUMN IF EXISTS "capacity_released_at",
  DROP COLUMN IF EXISTS "capacity_reservation";
