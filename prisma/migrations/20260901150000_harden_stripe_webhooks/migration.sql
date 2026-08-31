ALTER TABLE "vendors"
  ADD COLUMN "stripe_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stripe_payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stripe_requirements_currently_due" VARCHAR(100)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(100)[],
  ADD COLUMN "stripe_requirements_eventually_due" VARCHAR(100)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(100)[],
  ADD COLUMN "stripe_requirements_past_due" VARCHAR(100)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(100)[],
  ADD COLUMN "stripe_requirements_pending_verification" VARCHAR(100)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(100)[],
  ADD COLUMN "stripe_requirements_disabled_reason" VARCHAR(255),
  ADD COLUMN "stripe_account_updated_at" TIMESTAMPTZ;

ALTER TABLE "processed_webhook_events"
  RENAME COLUMN "processed_at" TO "claimed_at";

ALTER TABLE "processed_webhook_events"
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "status" VARCHAR(32) NOT NULL DEFAULT 'processed',
  ADD COLUMN "stripe_created_at" TIMESTAMPTZ,
  ADD COLUMN "queued_at" TIMESTAMPTZ,
  ADD COLUMN "processed_at" TIMESTAMPTZ,
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "enqueue_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_error" TEXT,
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "processed_webhook_events_status_next_attempt_at_idx"
  ON "processed_webhook_events"("status", "next_attempt_at");