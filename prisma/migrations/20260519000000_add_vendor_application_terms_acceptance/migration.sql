-- Vendor T&Cs acceptance audit on the application row.
ALTER TABLE "vendor_applications"
  ADD COLUMN "accepted_terms_at" TIMESTAMPTZ,
  ADD COLUMN "accepted_terms_version" VARCHAR(32);
