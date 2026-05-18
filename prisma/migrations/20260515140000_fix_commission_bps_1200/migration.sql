-- D4 (S1 Revenue Correctness): Vendor.commission_bps default was 1500 (15%)
-- but product copy, legal pages, and marketing all state 12% (1200 bps).
-- Without this migration vendors are paid the WRONG amount.
--
-- 1) Lower the schema default for new vendors from 15% → 12%.
ALTER TABLE "vendors" ALTER COLUMN "commission_bps" SET DEFAULT 1200;

-- 2) Backfill existing vendors that are still on the old 15% default.
--    Only rows still on 1500 are touched - vendors who were manually
--    placed on a non-default rate (e.g. a high-margin trial) are left
--    alone so we don't overwrite intentional pricing.
UPDATE "vendors" SET "commission_bps" = 1200 WHERE "commission_bps" = 1500;
