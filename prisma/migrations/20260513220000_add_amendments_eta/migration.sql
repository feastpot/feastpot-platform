-- FR-AMD-001 + FR-TRK-001: order amendments + vendor ETA.

DO $$ BEGIN
  CREATE TYPE "AmendmentStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "order_amendments" (
  "id"                UUID            NOT NULL DEFAULT gen_random_uuid(),
  "order_id"          UUID            NOT NULL,
  "vendor_id"         UUID            NOT NULL,
  "proposed_change"   TEXT            NOT NULL,
  "price_delta_pence" INTEGER         NOT NULL DEFAULT 0,
  "status"            "AmendmentStatus" NOT NULL DEFAULT 'pending',
  "expires_at"        TIMESTAMPTZ     NOT NULL,
  "responded_at"      TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT "order_amendments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "order_amendments_order_id_status_idx"
  ON "order_amendments"("order_id", "status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_amendments_order_id_fkey') THEN
    ALTER TABLE "order_amendments"
      ADD CONSTRAINT "order_amendments_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_amendments_vendor_id_fkey') THEN
    ALTER TABLE "order_amendments"
      ADD CONSTRAINT "order_amendments_vendor_id_fkey"
      FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id");
  END IF;
END $$;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "eta_minutes" INTEGER;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "eta_at" TIMESTAMPTZ;
