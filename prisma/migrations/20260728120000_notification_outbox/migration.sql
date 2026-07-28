-- Durable fallback for notification enqueues (retry when Redis/Bull is down).
CREATE TABLE IF NOT EXISTS "notification_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_name" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "job_id" VARCHAR(255),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notification_outbox_next_attempt_at_idx"
    ON "notification_outbox"("next_attempt_at");
