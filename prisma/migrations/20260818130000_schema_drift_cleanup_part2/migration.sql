-- Migration: 20260818130000_schema_drift_cleanup_part2
--
-- Cleans up additional drift revealed by migrate diff after part 1.
-- All statements are idempotent (IF EXISTS / IF NOT EXISTS guards).

-- =========================================================================
-- 1. terms_notices.vendor_id: TEXT → UUID
--    Migration created the column as TEXT; schema carries @db.Uuid.
--    All stored values are valid UUID strings so the USING cast is safe.
-- =========================================================================

ALTER TABLE terms_notices
  ALTER COLUMN vendor_id TYPE UUID USING vendor_id::UUID;

-- =========================================================================
-- 2. Add missing index on terms_notices(vendor_id, sent_at)
-- =========================================================================

CREATE INDEX IF NOT EXISTS "terms_notices_vendor_id_sent_at_idx"
  ON terms_notices (vendor_id, sent_at DESC);

-- =========================================================================
-- 3. terms_versions: drop the legacy `summary` column
--    The column was superseded by `change_summary` in migration
--    20260808120000_extend_terms_tables and is absent from schema.prisma.
-- =========================================================================

ALTER TABLE terms_versions
  DROP COLUMN IF EXISTS summary;

-- =========================================================================
-- 4. terms_versions column type corrections
--    version:      TEXT  → VARCHAR(32)  (schema: @db.VarChar(32))
--    content_hash: TEXT  → VARCHAR(64)  (schema: @db.VarChar(64))
--    The original add_terms_versioning migration created both as TEXT.
--    The extend_terms_tables migration tried to add content_hash as
--    VARCHAR(64) with IF NOT EXISTS but it was already TEXT, so the
--    ALTER was skipped.
-- =========================================================================

ALTER TABLE terms_versions
  ALTER COLUMN version TYPE VARCHAR(32),
  ALTER COLUMN content_hash TYPE VARCHAR(64)
    USING CASE
      WHEN length(content_hash) <= 64 THEN content_hash
      ELSE left(content_hash, 64)
    END;

-- =========================================================================
-- 5. Drop column defaults no longer present in schema.prisma
-- =========================================================================

ALTER TABLE terms_versions
  ALTER COLUMN content_mdx    DROP DEFAULT,
  ALTER COLUMN change_summary DROP DEFAULT;

-- Removing the DB-level default from vendor_slug_redirects.id:
-- schema carries @default(uuid()) which Prisma satisfies at the client
-- (ORM layer) rather than via a DB-level DEFAULT expression.
ALTER TABLE vendor_slug_redirects
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE vendor_tax_profiles
  ALTER COLUMN updated_at DROP DEFAULT;

-- =========================================================================
-- 6. vendor_slug_redirects FK: update ON UPDATE from NO ACTION → CASCADE
--    Schema has onDelete: Cascade (explicit) and onUpdate implicitly
--    defaults to Cascade in Prisma. DB currently uses NO ACTION for
--    ON UPDATE, which diverges from the Prisma-generated name.
-- =========================================================================

ALTER TABLE vendor_slug_redirects
  DROP CONSTRAINT IF EXISTS "vendor_slug_redirects_vendor_id_fkey";

ALTER TABLE vendor_slug_redirects
  ADD CONSTRAINT "vendor_slug_redirects_vendor_id_fkey"
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- =========================================================================
-- 7. vendor_verifications.last_notified_channel: VARCHAR(20) → TEXT
--    Schema carries String? (no @db qualifier) which maps to TEXT.
-- =========================================================================

ALTER TABLE vendor_verifications
  ALTER COLUMN last_notified_channel TYPE TEXT;

-- =========================================================================
-- 8. vendors: re-set array column defaults to the canonical form
--    Prisma generates for @default([]) @db.VarChar(n) arrays.
--    The original migration used a double-cast expression that Prisma's
--    introspector normalises differently, causing drift on every diff run.
-- =========================================================================

ALTER TABLE vendors
  ALTER COLUMN featured_dishes
    SET DEFAULT ARRAY[]::VARCHAR(120)[],
  ALTER COLUMN specialities
    SET DEFAULT ARRAY[]::VARCHAR(64)[];
