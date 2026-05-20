-- T002: Vendor availability & scheduling.
-- Adds per-vendor opening days / hours / lead time / daily caps and the
-- BlackoutDate table. Defaults on the new columns keep behaviour
-- identical to the pre-T002 hardcoded OrderSlotsService defaults so
-- existing vendors and orders continue to work without a backfill step.

ALTER TABLE "vendors"
  ADD COLUMN "opening_days"                INTEGER[]  NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],
  ADD COLUMN "slot_open_hour"              INTEGER    NOT NULL DEFAULT 9,
  ADD COLUMN "slot_close_hour"             INTEGER    NOT NULL DEFAULT 21,
  ADD COLUMN "prep_lead_hours"             INTEGER    NOT NULL DEFAULT 24,
  ADD COLUMN "max_orders_per_day"          INTEGER,
  ADD COLUMN "max_trays_per_day"           INTEGER,
  ADD COLUMN "same_day_orders"             BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN "large_order_lead_hours"      INTEGER,
  ADD COLUMN "large_order_tray_threshold"  INTEGER,
  ADD COLUMN "event_catering_manual_quote" BOOLEAN    NOT NULL DEFAULT false;

CREATE TABLE "blackout_dates" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id"  UUID         NOT NULL,
  "date"       DATE         NOT NULL,
  "reason"     VARCHAR(255),
  "created_at" TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "blackout_dates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "blackout_dates_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "blackout_dates_vendor_id_date_key"
  ON "blackout_dates" ("vendor_id", "date");

CREATE INDEX "blackout_dates_vendor_id_date_idx"
  ON "blackout_dates" ("vendor_id", "date");
