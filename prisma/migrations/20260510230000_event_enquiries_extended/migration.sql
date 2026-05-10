-- Event enquiries: extend for full quote / deposit / balance flow
ALTER TABLE "event_enquiries" ADD COLUMN IF NOT EXISTS "final_guest_count"   INTEGER;
ALTER TABLE "event_enquiries" ADD COLUMN IF NOT EXISTS "dietary"             VARCHAR(32)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(32)[];
ALTER TABLE "event_enquiries" ADD COLUMN IF NOT EXISTS "menu_adjustments"    TEXT;
ALTER TABLE "event_enquiries" ADD COLUMN IF NOT EXISTS "vendor_id"           UUID;
ALTER TABLE "event_enquiries" ADD COLUMN IF NOT EXISTS "matched_vendor_ids"  UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "event_enquiries" ADD COLUMN IF NOT EXISTS "quote_deadline"      TIMESTAMPTZ;
ALTER TABLE "event_enquiries" ADD COLUMN IF NOT EXISTS "deposit_pi_id"       VARCHAR(100);
ALTER TABLE "event_enquiries" ADD COLUMN IF NOT EXISTS "balance_pi_id"       VARCHAR(100);
ALTER TABLE "event_enquiries" ADD COLUMN IF NOT EXISTS "confirmed_at"        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "event_enquiries_vendor_id_idx" ON "event_enquiries"("vendor_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_enquiries_vendor_id_fkey'
  ) THEN
    ALTER TABLE "event_enquiries"
      ADD CONSTRAINT "event_enquiries_vendor_id_fkey"
      FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Event quotes: extend with per-head pricing + deposit terms
ALTER TABLE "event_quotes" ADD COLUMN IF NOT EXISTS "per_head_pence"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "event_quotes" ADD COLUMN IF NOT EXISTS "delivery_fee_pence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "event_quotes" ADD COLUMN IF NOT EXISTS "min_deposit_pct"    INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "event_quotes" ADD COLUMN IF NOT EXISTS "proposed_menu"      TEXT;
ALTER TABLE "event_quotes" ADD COLUMN IF NOT EXISTS "terms"              TEXT;
