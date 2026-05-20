-- T007: in-app vendor notifications inbox.
-- Per-user notification rows, polled by the vendor portal top-nav bell
-- and listed on /notifications. Service writes are best-effort: emitters
-- swallow errors so business flows (orders, payouts, etc.) are never
-- blocked by an inbox write failure.

-- Enum of supported notification kinds. New values must be added to the
-- TS InboxService dispatch as well.
CREATE TYPE "InboxNotificationType" AS ENUM (
  'order_created',
  'order_status_changed',
  'event_enquiry_matched',
  'event_enquiry_quote_accepted',
  'payout_processed',
  'review_received',
  'compliance_expiring',
  'compliance_expired',
  'menu_item_rejected',
  'dispute_raised',
  'dispute_resolved',
  'account_credit_issued',
  'account_suspended',
  'generic'
);

CREATE TABLE "inbox_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "type" "InboxNotificationType" NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "body" TEXT NOT NULL,
  "link" VARCHAR(500),
  "metadata" JSONB,
  "read_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inbox_notifications_pkey" PRIMARY KEY ("id")
);

-- Hot path: list-unread for a single user (top-nav badge).
CREATE INDEX "inbox_notifications_user_id_read_at_idx"
  ON "inbox_notifications" ("user_id", "read_at");

-- Hot path: paginated list newest-first for a single user.
CREATE INDEX "inbox_notifications_user_id_created_at_idx"
  ON "inbox_notifications" ("user_id", "created_at");

ALTER TABLE "inbox_notifications"
  ADD CONSTRAINT "inbox_notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
