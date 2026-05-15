-- Adds customer-cancellation audit columns to orders.
-- Both nullable, both safe additive changes (no rewrite, no lock escalation
-- beyond a brief AccessExclusiveLock on metadata). Backfill is intentionally
-- skipped — historical orders have no recorded cancellation reason/actor.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_by"        VARCHAR(32);
