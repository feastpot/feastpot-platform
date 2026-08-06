-- ============================================================
-- Vendor verification panel (structured compliance record)
-- ============================================================

CREATE TYPE "FhrsStatus" AS ENUM (
  'AWAITING_FIRST_INSPECTION',
  'RATED',
  'EXEMPT',
  'NOT_FOUND'
);

CREATE TYPE "VerificationState" AS ENUM (
  'VERIFIED',
  'RENEWAL_DUE',
  'SUSPENDED'
);

CREATE TABLE "vendor_verifications" (
  "id"                       TEXT         NOT NULL,
  "vendor_id"                UUID         NOT NULL,
  "registration_number"      TEXT         NOT NULL,
  "registration_authority"   TEXT         NOT NULL,
  "registration_confirmed_at" TIMESTAMPTZ NOT NULL,
  "fhrs_rating"              INTEGER,
  "fhrs_rating_checked_at"   TIMESTAMPTZ,
  "fhrs_inspection_status"   "FhrsStatus" NOT NULL,
  "insurance_provider"       TEXT,
  "insurance_valid_until"    TIMESTAMPTZ,
  "allergen_training_held"   BOOLEAN      NOT NULL DEFAULT false,
  "allergen_training_until"  TIMESTAMPTZ,
  "id_verified_at"           TIMESTAMPTZ,
  "overall_state"            "VerificationState" NOT NULL,
  "updated_at"               TIMESTAMPTZ  NOT NULL,
  CONSTRAINT "vendor_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_verifications_vendor_id_key"
  ON "vendor_verifications"("vendor_id");

CREATE INDEX "vendor_verifications_overall_state_idx"
  ON "vendor_verifications"("overall_state");

ALTER TABLE "vendor_verifications"
  ADD CONSTRAINT "vendor_verifications_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_verifications" ENABLE ROW LEVEL SECURITY;
