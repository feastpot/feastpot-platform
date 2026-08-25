-- The schema has always included vendors.specialities, but the original
-- migration history omitted the column. This migration intentionally sorts
-- before the drift-cleanup migration that normalises its default, allowing a
-- clean database to apply the full history without error.
--
-- Existing environments where the column was created outside migrations are
-- unaffected. Environments without it receive the schema-compatible column.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS specialities VARCHAR(64)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(64)[];