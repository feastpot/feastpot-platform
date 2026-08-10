-- Migration: add isSeedData flag to Vendor and Order
--
-- OPERATOR: take a full database backup before running `npm run db:deploy`
-- in production. Recovery from this migration (and its successor) is via the
-- pre-migration backup only; no Prisma down migration is provided.
--
-- PURPOSE: these columns allow the seed script to tag test rows so the
-- subsequent purge migration (20260810110000) can remove them cleanly.
-- Set is_seed_data = true on any Vendor or Order row created by the seed
-- script, then run the next migration.

ALTER TABLE vendors ADD COLUMN is_seed_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders  ADD COLUMN is_seed_data BOOLEAN NOT NULL DEFAULT false;
