-- Shared order/catering payment ledger. Existing payment rows are order rows.
ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'processing' AFTER 'approved';

ALTER TABLE "payments" ALTER COLUMN "order_id" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN "catering_booking_id" UUID;
ALTER TABLE "payments" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_catering_booking_id_fkey"
  FOREIGN KEY ("catering_booking_id") REFERENCES "catering_bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_exactly_one_subject"
  CHECK (("order_id" IS NOT NULL) <> ("catering_booking_id" IS NOT NULL));
CREATE INDEX "payments_catering_booking_id_idx" ON "payments"("catering_booking_id");

CREATE TABLE "refund_operations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID,
  "catering_booking_id" UUID,
  "payment_intent_id" VARCHAR(100) NOT NULL,
  "amount_pence" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "stripe_refund_id" VARCHAR(100),
  "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "failure_reason" TEXT,
  "cancel_booking" BOOLEAN NOT NULL DEFAULT FALSE,
  "cancellation_reason" TEXT,
  "reversal_payout_id" UUID,
  "reversal_transfer_id" VARCHAR(100),
  "reversal_amount_pence" INTEGER,
  "reversal_idempotency_key" VARCHAR(255),
  "reversal_status" VARCHAR(32),
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refund_operations_exactly_one_subject"
    CHECK (("order_id" IS NOT NULL) <> ("catering_booking_id" IS NOT NULL)),
  CONSTRAINT "refund_operations_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "refund_operations_catering_booking_id_fkey"
    FOREIGN KEY ("catering_booking_id") REFERENCES "catering_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "refund_operations_idempotency_key_key" ON "refund_operations"("idempotency_key");
CREATE UNIQUE INDEX "refund_operations_stripe_refund_id_key" ON "refund_operations"("stripe_refund_id");
CREATE INDEX "refund_operations_order_id_status_idx" ON "refund_operations"("order_id", "status");
CREATE INDEX "refund_operations_catering_booking_id_status_idx" ON "refund_operations"("catering_booking_id", "status");