-- Add three-tier AttributionSource enum and extend order_attributions with
-- resolved_source (denormalised label) and marker_set_at (marker timestamp).

CREATE TYPE "AttributionSource" AS ENUM (
  'VENDOR_REFERRED',
  'MARKETPLACE_FIRST',
  'MARKETPLACE_REPEAT'
);

ALTER TABLE "order_attributions"
  ADD COLUMN "resolved_source" "AttributionSource",
  ADD COLUMN "marker_set_at"   TIMESTAMPTZ;

-- Backfill existing rows from the already-stored source + is_first_order columns.
UPDATE "order_attributions"
SET "resolved_source" = CASE
  WHEN source = 'VENDOR_REFERRED'
    THEN 'VENDOR_REFERRED'::"AttributionSource"
  WHEN source = 'MARKETPLACE' AND is_first_order = true
    THEN 'MARKETPLACE_FIRST'::"AttributionSource"
  ELSE
    'MARKETPLACE_REPEAT'::"AttributionSource"
END;
