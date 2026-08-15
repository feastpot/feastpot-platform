-- The featured_dishes column was initially added to the vendors table via
-- `prisma db push` rather than a versioned migration.  This migration adds it
-- explicitly so that fresh databases (CI, new dev environments, production)
-- have the column in the correct position - before
-- 20260813220000_vendor_slug_redirects, which resets it to empty arrays when
-- migrating from the legacy free-text format.
--
-- IF NOT EXISTS makes this a no-op on any database where the column was
-- already present (added via db push).

ALTER TABLE "public"."vendors"
  ADD COLUMN IF NOT EXISTS "featured_dishes" VARCHAR(120)[] NOT NULL DEFAULT '{}';
