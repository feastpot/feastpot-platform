-- Disputes / Compliance / Reviews / Notifications module schema additions

-- ---------- push_subscriptions (notifications) ----------
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID NOT NULL,
  "endpoint"   VARCHAR(500) NOT NULL,
  "p256dh"     VARCHAR(255) NOT NULL,
  "auth"       VARCHAR(255) NOT NULL,
  "user_agent" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- ---------- vendors: badge fields ----------
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "reorder_rate_pct"   DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "community_favourite" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "vendors_community_favourite_idx" ON "vendors"("community_favourite");

-- ---------- disputes: assignment + vendor response ----------
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "assigned_to_id"        UUID;
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "vendor_response"       TEXT;
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "vendor_responded_at"   TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS "disputes_assigned_to_id_idx" ON "disputes"("assigned_to_id");
-- One open dispute per order. If existing data violates, this will fail loudly.
CREATE UNIQUE INDEX IF NOT EXISTS "disputes_order_id_key" ON "disputes"("order_id");

-- ---------- reviews: moderation columns ----------
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "moderation_status" VARCHAR(20) NOT NULL DEFAULT 'auto_approved';
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "moderated_by_id"   UUID;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "moderated_at"      TIMESTAMPTZ;

-- Promote moderation_status to the existing ModerationStatus enum if Prisma
-- created it for menu_items already. Safe even if the cast no-ops.
DO $$ BEGIN
  ALTER TABLE "reviews"
    ALTER COLUMN "moderation_status" TYPE "ModerationStatus"
    USING "moderation_status"::"ModerationStatus";
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "reviews_moderation_status_idx" ON "reviews"("moderation_status");
-- One review per order (matches domain rule: a customer reviews each order once).
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_order_id_key" ON "reviews"("order_id");
