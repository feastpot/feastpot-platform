-- Migrate catering_bookings.attribution_source from VARCHAR(32) to the AttributionSource enum.
--
-- Existing rows written by createQuote used OrderSource strings ('MARKETPLACE', 'VENDOR_REFERRED').
-- createQuote always set isFirstOrder=true, so every MARKETPLACE row maps to MARKETPLACE_FIRST.
-- VENDOR_REFERRED rows (manually corrected by admin) map 1:1.

ALTER TABLE "catering_bookings"
  ALTER COLUMN "attribution_source" TYPE "AttributionSource"
  USING CASE
    WHEN "attribution_source" = 'VENDOR_REFERRED' THEN 'VENDOR_REFERRED'::"AttributionSource"
    WHEN "attribution_source" = 'MARKETPLACE'     THEN 'MARKETPLACE_FIRST'::"AttributionSource"
    ELSE NULL
  END;
