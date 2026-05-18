-- Extend enum with new statuses.
-- Postgres requires ALTER TYPE ADD VALUE statements outside any tx that uses
-- them in the same statement - they are auto-committed before the rest of
-- the migration runs.
ALTER TYPE "VendorApplicationStatus" ADD VALUE IF NOT EXISTS 'under_review';
ALTER TYPE "VendorApplicationStatus" ADD VALUE IF NOT EXISTS 'information_requested';

-- Split review_note into admin_notes + rejection_reason. We MOVE existing
-- data into admin_notes (which is the strict superset semantically - any
-- existing note was an internal admin scratchpad). Approved-after-this rows
-- will populate rejection_reason as needed.
ALTER TABLE "vendor_applications"
  ADD COLUMN IF NOT EXISTS "admin_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "vendor_id" UUID;

-- Backfill: copy review_note → admin_notes for any existing rows.
UPDATE "vendor_applications"
  SET "admin_notes" = "review_note"
  WHERE "review_note" IS NOT NULL AND "admin_notes" IS NULL;

ALTER TABLE "vendor_applications" DROP COLUMN IF EXISTS "review_note";

-- vendor_id: unique (one application per vendor) + FK SET NULL.
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_applications_vendor_id_key"
  ON "vendor_applications"("vendor_id");

ALTER TABLE "vendor_applications"
  ADD CONSTRAINT "vendor_applications_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
