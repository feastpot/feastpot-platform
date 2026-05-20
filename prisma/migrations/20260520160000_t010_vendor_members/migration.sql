-- T010: vendor team membership + RBAC. The vendor owner is the existing
-- User.vendor 1:1 relation; this table layers additional members on top.
-- Pending rows have a null user_id and a stored invited_email so we can
-- match them up when the invitee first signs in.

CREATE TYPE "VendorMemberRole" AS ENUM (
  'owner',
  'kitchen_manager',
  'finance',
  'staff',
  'delivery_coordinator'
);

CREATE TYPE "VendorMemberStatus" AS ENUM ('pending', 'active', 'removed');

CREATE TABLE "vendor_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "user_id" UUID,
  "invited_email" VARCHAR(255) NOT NULL,
  "role" "VendorMemberRole" NOT NULL,
  "status" "VendorMemberStatus" NOT NULL DEFAULT 'pending',
  "invited_by_id" UUID,
  "accepted_at" TIMESTAMPTZ,
  "removed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "vendor_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_members_vendor_id_invited_email_key"
  ON "vendor_members" ("vendor_id", "invited_email");

CREATE INDEX "vendor_members_vendor_id_status_idx"
  ON "vendor_members" ("vendor_id", "status");

CREATE INDEX "vendor_members_user_id_idx"
  ON "vendor_members" ("user_id");

ALTER TABLE "vendor_members"
  ADD CONSTRAINT "vendor_members_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_members"
  ADD CONSTRAINT "vendor_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vendor_members"
  ADD CONSTRAINT "vendor_members_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
