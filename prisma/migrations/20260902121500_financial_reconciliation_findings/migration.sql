CREATE TABLE IF NOT EXISTS "financial_reconciliation_findings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fingerprint" VARCHAR(255) NOT NULL,
  "kind" VARCHAR(80) NOT NULL,
  "stripe_object_id" VARCHAR(100),
  "local_entity_id" VARCHAR(100),
  "stripe_amount_pence" INTEGER,
  "local_amount_pence" INTEGER,
  "detail" JSONB,
  "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ,
  CONSTRAINT "financial_reconciliation_findings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "financial_reconciliation_findings_fingerprint_key"
  ON "financial_reconciliation_findings"("fingerprint");
CREATE INDEX IF NOT EXISTS "financial_reconciliation_findings_kind_resolved_at_idx"
  ON "financial_reconciliation_findings"("kind", "resolved_at");
CREATE INDEX IF NOT EXISTS "financial_reconciliation_findings_last_seen_at_idx"
  ON "financial_reconciliation_findings"("last_seen_at");

ALTER TABLE "financial_reconciliation_findings" ENABLE ROW LEVEL SECURITY;