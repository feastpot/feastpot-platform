-- FR-DISC-001: discount codes
DO $$ BEGIN
  CREATE TYPE "DiscountType" AS ENUM ('flat', 'percentage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "discount_codes" (
  "id"                  UUID            NOT NULL DEFAULT gen_random_uuid(),
  "code"                VARCHAR(30)     NOT NULL,
  "type"                "DiscountType"  NOT NULL,
  "value"               INTEGER         NOT NULL,
  "min_order_pence"     INTEGER         NOT NULL DEFAULT 0,
  "max_uses"            INTEGER,
  "used_count"          INTEGER         NOT NULL DEFAULT 0,
  "expires_at"          TIMESTAMPTZ,
  "vendor_id"           UUID,
  "is_active"           BOOLEAN         NOT NULL DEFAULT TRUE,
  "created_by_user_id"  UUID            NOT NULL,
  "created_at"          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "discount_codes_code_key"
  ON "discount_codes"("code");
CREATE INDEX IF NOT EXISTS "discount_codes_code_idx"
  ON "discount_codes"("code");
CREATE INDEX IF NOT EXISTS "discount_codes_is_active_expires_at_idx"
  ON "discount_codes"("is_active", "expires_at");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_codes_vendor_id_fkey') THEN
    ALTER TABLE "discount_codes"
      ADD CONSTRAINT "discount_codes_vendor_id_fkey"
      FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_codes_created_by_user_id_fkey') THEN
    ALTER TABLE "discount_codes"
      ADD CONSTRAINT "discount_codes_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");
  END IF;
END $$;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_code_id" UUID;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_discount_code_id_fkey') THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_discount_code_id_fkey"
      FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes"("id") ON DELETE SET NULL;
  END IF;
END $$;
