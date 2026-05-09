-- Payments + Payouts module schema additions

-- 1. Drop unique constraint on payments.stripe_payment_intent_id (now many rows per PI:
--    capture + N refunds + commission credits all share the same PI).
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_stripe_payment_intent_id_key";
CREATE INDEX IF NOT EXISTS "payments_stripe_payment_intent_id_idx"
  ON "payments"("stripe_payment_intent_id");

-- 2. Add stripe_refund_id (unique) so refund.updated webhooks can target the
--    exact refund row rather than smearing status across all PI refunds.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "stripe_refund_id" VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_refund_id_key"
  ON "payments"("stripe_refund_id");

-- 3. Payout breakdown columns (gross / commission / refunds / period / hold reason).
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "gross_pence"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "commission_pence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "refunds_pence"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "period_start"     TIMESTAMPTZ;
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "period_end"       TIMESTAMPTZ;
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "order_count"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "hold_reason"      TEXT;

CREATE INDEX IF NOT EXISTS "payouts_vendor_id_period_end_idx"
  ON "payouts"("vendor_id", "period_end");
-- Idempotency: only one payout row per (vendor, period_end). Final guarantor against
-- concurrent weekly-batch runs.
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_vendor_period_unique"
  ON "payouts"("vendor_id", "period_end");

-- 4. Webhook idempotency table.
CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "stripe_event_id" VARCHAR(100) NOT NULL,
  "event_type"      VARCHAR(100) NOT NULL,
  "processed_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "processed_webhook_events_stripe_event_id_key"
  ON "processed_webhook_events"("stripe_event_id");
CREATE INDEX IF NOT EXISTS "processed_webhook_events_event_type_idx"
  ON "processed_webhook_events"("event_type");
