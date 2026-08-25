-- Forward-only convergence guard for the Prisma CI drift gate.
--
-- The preceding cleanup was not present in the revision checked by the
-- failing CI run. Keep this migration independently idempotent so that either
-- an already-converged database or that revision's schema reaches the same
-- result without editing recorded history.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "avatar_url" VARCHAR(500);

ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "logo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "cover_image_url" TEXT,
  ADD COLUMN IF NOT EXISTS "vendor_story" TEXT,
  ADD COLUMN IF NOT EXISTS "social_links" JSONB;

DROP INDEX IF EXISTS "idx_loyalty_points_user_id";
DROP INDEX IF EXISTS "idx_orders_customer_created";
DROP INDEX IF EXISTS "idx_vendors_cuisine_gin";

DROP INDEX IF EXISTS "payments_stripe_payment_intent_id_key";
CREATE INDEX IF NOT EXISTS "payments_stripe_payment_intent_id_idx"
  ON "payments" ("stripe_payment_intent_id");

DROP INDEX IF EXISTS "email_events_suppressed_lower_to_idx";
CREATE INDEX "email_events_suppressed_lower_to_idx"
  ON "email_events" ("to");

DO $$ BEGIN
  IF to_regclass('public.delivery_configs_latitude_longitude_idx') IS NULL
     AND to_regclass('public.delivery_configs_lat_lng_idx') IS NOT NULL THEN
    ALTER INDEX "delivery_configs_lat_lng_idx"
      RENAME TO "delivery_configs_latitude_longitude_idx";
  END IF;
END $$;
DROP INDEX IF EXISTS "delivery_configs_lat_lng_idx";

DO $$ BEGIN
  IF to_regclass('public.payouts_vendor_id_period_end_key') IS NULL
     AND to_regclass('public.payouts_vendor_period_unique') IS NOT NULL THEN
    ALTER INDEX "payouts_vendor_period_unique"
      RENAME TO "payouts_vendor_id_period_end_key";
  END IF;
END $$;
DROP INDEX IF EXISTS "payouts_vendor_period_unique";

ALTER TABLE "reviews"
  ALTER COLUMN "moderation_status" DROP DEFAULT,
  ALTER COLUMN "moderation_status" TYPE "ModerationStatus"
    USING "moderation_status"::TEXT::"ModerationStatus",
  ALTER COLUMN "moderation_status" SET DEFAULT 'auto_approved';

CREATE INDEX IF NOT EXISTS "reviews_moderation_status_idx"
  ON "reviews" ("moderation_status");

ALTER TABLE "event_enquiries"
  ALTER COLUMN "dietary" DROP DEFAULT,
  ALTER COLUMN "matched_vendor_ids" DROP DEFAULT;

ALTER TABLE "blackout_dates"
  DROP CONSTRAINT IF EXISTS "blackout_dates_vendor_id_fkey";
ALTER TABLE "blackout_dates"
  ADD CONSTRAINT "blackout_dates_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_subscriptions"
  DROP CONSTRAINT IF EXISTS "push_subscriptions_user_id_fkey";
ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "discount_codes"
  DROP CONSTRAINT IF EXISTS "discount_codes_vendor_id_fkey",
  DROP CONSTRAINT IF EXISTS "discount_codes_created_by_user_id_fkey";
ALTER TABLE "discount_codes"
  ADD CONSTRAINT "discount_codes_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "discount_codes_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders"
  DROP CONSTRAINT IF EXISTS "orders_discount_code_id_fkey";
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_discount_code_id_fkey"
  FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_amendments"
  DROP CONSTRAINT IF EXISTS "order_amendments_order_id_fkey",
  DROP CONSTRAINT IF EXISTS "order_amendments_vendor_id_fkey";
ALTER TABLE "order_amendments"
  ADD CONSTRAINT "order_amendments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_amendments_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_enquiries"
  DROP CONSTRAINT IF EXISTS "event_enquiries_vendor_id_fkey";
ALTER TABLE "event_enquiries"
  ADD CONSTRAINT "event_enquiries_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;