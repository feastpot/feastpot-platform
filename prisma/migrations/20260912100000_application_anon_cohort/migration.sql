ALTER TABLE "vendor_applications"
  ADD COLUMN IF NOT EXISTS "anon_visitor_id" VARCHAR(128);
CREATE INDEX IF NOT EXISTS "vendor_applications_anon_visitor_id_created_at_idx"
  ON "vendor_applications" ("anon_visitor_id", "created_at");