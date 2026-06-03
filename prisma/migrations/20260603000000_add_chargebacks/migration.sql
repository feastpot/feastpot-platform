-- CreateTable
CREATE TABLE "chargebacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID,
    "payment_id" UUID,
    "stripe_dispute_id" VARCHAR(100) NOT NULL,
    "stripe_charge_id" VARCHAR(100),
    "stripe_payment_intent_id" VARCHAR(100),
    "amount_pence" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'GBP',
    "status" VARCHAR(50) NOT NULL,
    "reason" VARCHAR(100),
    "evidence_due_by" TIMESTAMPTZ,
    "opened_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chargebacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chargebacks_stripe_dispute_id_key" ON "chargebacks"("stripe_dispute_id");

-- CreateIndex
CREATE INDEX "chargebacks_order_id_idx" ON "chargebacks"("order_id");

-- CreateIndex
CREATE INDEX "chargebacks_payment_id_idx" ON "chargebacks"("payment_id");

-- CreateIndex
CREATE INDEX "chargebacks_status_idx" ON "chargebacks"("status");

-- CreateIndex
CREATE INDEX "chargebacks_created_at_idx" ON "chargebacks"("created_at");

-- CreateIndex
CREATE INDEX "payments_stripe_charge_id_idx" ON "payments"("stripe_charge_id");

-- AddForeignKey
ALTER TABLE "chargebacks" ADD CONSTRAINT "chargebacks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chargebacks" ADD CONSTRAINT "chargebacks_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deny-by-default RLS: the API writes to chargebacks via its privileged
-- Postgres role (bypasses RLS) from the Stripe webhook processor, while the
-- Supabase anon/authenticated keys shipped to the frontends get no direct
-- PostgREST access. Mirrors the invariant set in
-- 20260513000000_enable_rls_all_tables.
ALTER TABLE "chargebacks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chargebacks" FORCE ROW LEVEL SECURITY;
