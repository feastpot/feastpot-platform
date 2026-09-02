ALTER TABLE "payouts"
  ADD COLUMN IF NOT EXISTS "opening_balance_pence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "raw_net_pence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "closing_balance_pence" INTEGER NOT NULL DEFAULT 0;

UPDATE "payouts"
SET
  "raw_net_pence" = "amount_pence",
  "closing_balance_pence" = CASE WHEN "amount_pence" < 0 THEN "amount_pence" ELSE 0 END,
  "amount_pence" = GREATEST("amount_pence", 0)
WHERE "raw_net_pence" = 0
  AND "opening_balance_pence" = 0
  AND "closing_balance_pence" = 0;

ALTER TABLE "payouts"
  DROP CONSTRAINT IF EXISTS "payouts_amount_non_negative";
ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_amount_non_negative" CHECK ("amount_pence" >= 0);