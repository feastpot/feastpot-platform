-- Add latitude/longitude to delivery_configs so customer search can match
-- by real distance instead of an outward-postcode-prefix proxy.
ALTER TABLE "delivery_configs"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;

CREATE INDEX "delivery_configs_lat_lng_idx"
  ON "delivery_configs" ("latitude", "longitude");
