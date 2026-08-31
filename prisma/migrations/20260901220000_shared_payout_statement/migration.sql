ALTER TABLE "payouts"
  ADD COLUMN IF NOT EXISTS "chargebacks_pence" INTEGER,
  ADD COLUMN IF NOT EXISTS "service_fees_pence" INTEGER,
  ADD COLUMN IF NOT EXISTS "adjustments_pence" INTEGER,
  ADD COLUMN IF NOT EXISTS "statement" JSONB;

COMMENT ON COLUMN "payouts"."statement" IS
  'Immutable canonical payout statement snapshot. Null on legacy payouts created before statement snapshots.';