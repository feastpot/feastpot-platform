-- T5 vendor acquisition form: postcode already exists; add delivery radius,
-- food hygiene registration number and typical order types. All additive and
-- nullable/defaulted so existing rows are untouched.
ALTER TABLE "vendor_applications"
  ADD COLUMN IF NOT EXISTS "delivery_radius_miles" INTEGER,
  ADD COLUMN IF NOT EXISTS "hygiene_reg_number" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "order_types" TEXT[] NOT NULL DEFAULT '{}';
