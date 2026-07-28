-- Chargeback loss reconciliation + evidence-deadline warning bookkeeping.
-- reconciled_at: set once when a LOST chargeback's order finances have been
--   reconciled (refund + credit Payment rows written); CAS guard.
-- evidence_warned_at: set once when the evidence-deadline warning has been
--   sent to finance, so the hourly monitor never re-alerts.
ALTER TABLE "chargebacks" ADD COLUMN "reconciled_at" TIMESTAMPTZ;
ALTER TABLE "chargebacks" ADD COLUMN "evidence_warned_at" TIMESTAMPTZ;
