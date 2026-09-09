ALTER TABLE "vendor_applications"
  ADD COLUMN IF NOT EXISTS "resume_token_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "resume_expires_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "submission_claim_token" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "submission_claim_expires_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "current_step" VARCHAR(64) NOT NULL DEFAULT 'phase_1',
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "cuisine_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "occasion_slugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "menu_photo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "menu_photo_path" TEXT,
  ADD COLUMN IF NOT EXISTS "menu_build_from_photo" BOOLEAN NOT NULL DEFAULT false;

-- Every pre-existing row was created by the old one-shot submission endpoint.
UPDATE "vendor_applications"
SET "submitted_at" = "created_at"
WHERE "submitted_at" IS NULL
  AND "resume_token_hash" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_applications_resume_token_hash_key"
  ON "vendor_applications"("resume_token_hash");

CREATE INDEX IF NOT EXISTS "vendor_applications_submitted_at_status_created_at_idx"
  ON "vendor_applications"("submitted_at", "status", "created_at");