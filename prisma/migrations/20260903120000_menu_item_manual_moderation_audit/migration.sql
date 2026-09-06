-- Pilot posture: menu submissions are manually moderated by default.  Keep the
-- fields nullable so historical rows retain their original provenance.
ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "decision_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "moderated_by_id" UUID;

ALTER TABLE "menu_items" ALTER COLUMN "moderation_status" SET DEFAULT 'held';

CREATE INDEX IF NOT EXISTS "menu_items_moderation_status_submitted_at_idx"
  ON "menu_items" ("moderation_status", "submitted_at");

DO $$ BEGIN
  ALTER TABLE "menu_items"
    ADD CONSTRAINT "menu_items_moderated_by_id_fkey"
    FOREIGN KEY ("moderated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;