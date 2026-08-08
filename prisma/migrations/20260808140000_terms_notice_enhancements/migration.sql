-- Migration: extend terms_notices with NoticeChannel enum, openedAt, acknowledgedAt.
-- Depends on: 20260808120000_extend_terms_tables (terms_notices table must exist).

-- 1. Create the NoticeChannel enum (idempotent guard via DO block).
DO $$ BEGIN
  CREATE TYPE "NoticeChannel" AS ENUM ('EMAIL', 'DASHBOARD', 'WHATSAPP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add new audit columns.
ALTER TABLE "terms_notices" ADD COLUMN IF NOT EXISTS "opened_at"       TIMESTAMPTZ;
ALTER TABLE "terms_notices" ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMPTZ;

-- 3. Normalise existing channel values to uppercase so the cast succeeds.
UPDATE "terms_notices" SET "channel" = UPPER("channel") WHERE "channel" IS NOT NULL;

-- 4. Convert the channel column from VARCHAR to the new enum.
--    Steps required by Postgres: add a new column, populate it, drop old, rename.
ALTER TABLE "terms_notices" ADD COLUMN IF NOT EXISTS "channel_new" "NoticeChannel";
UPDATE "terms_notices" SET "channel_new" = "channel"::"NoticeChannel" WHERE "channel" IS NOT NULL;
-- Default any NULL rows to EMAIL (should not exist in practice but be safe).
UPDATE "terms_notices" SET "channel_new" = 'EMAIL'::"NoticeChannel" WHERE "channel_new" IS NULL;
ALTER TABLE "terms_notices" DROP COLUMN "channel";
ALTER TABLE "terms_notices" RENAME COLUMN "channel_new" TO "channel";
ALTER TABLE "terms_notices" ALTER COLUMN "channel" SET NOT NULL;
