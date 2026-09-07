-- Optimistic locking for menu moderation. Existing submissions start at v1.
ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "submission_version" INTEGER NOT NULL DEFAULT 1;