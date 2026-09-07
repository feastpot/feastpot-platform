ALTER TABLE "vendor_applications"
  ADD COLUMN IF NOT EXISTS "is_test_data" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "vendor_applications_is_test_data_status_created_at_idx"
  ON "vendor_applications" ("is_test_data", "status", "created_at");

CREATE TABLE IF NOT EXISTS "vendor_application_info_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL REFERENCES "vendor_applications"("id") ON DELETE CASCADE,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "requested_items" TEXT[] NOT NULL,
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vendor_application_info_requests_application_id_created_at_idx"
  ON "vendor_application_info_requests" ("application_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "vendor_application_info_requests_actor_id_idx"
  ON "vendor_application_info_requests" ("actor_id");