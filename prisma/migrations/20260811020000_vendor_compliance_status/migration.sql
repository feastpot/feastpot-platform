-- Migration: vendor FSA compliance gate (Prompt 13)
--
-- Adds VendorComplianceStatus enum and six FSA FHRS fields to vendors.
-- These are DISTINCT from the customer star-rating columns (rating / rating_count).
--
-- Listing gate: only RATED vendors with fsa_hygiene_rating >= 3 appear in
-- customer-facing search or may accept orders.  REGISTERED_AWAITING_INSPECTION
-- vendors may complete onboarding but are invisible to customers.
-- NOT_ELIGIBLE vendors cannot proceed past the application stage.
--
-- Backfill:
--   Vendors with a vendor_verifications row in RATED state, fhrs_rating >= 3
--   → compliance_status = 'RATED', fsa_hygiene_rating copied over.
--   Vendors with fhrs_inspection_status = 'AWAITING_FIRST_INSPECTION'
--   → compliance_status = 'REGISTERED_AWAITING_INSPECTION'.
--   All others remain NOT_ELIGIBLE.

-- CreateEnum
CREATE TYPE "VendorComplianceStatus" AS ENUM ('RATED', 'REGISTERED_AWAITING_INSPECTION', 'NOT_ELIGIBLE');

-- AlterTable
ALTER TABLE "vendors"
  ADD COLUMN "compliance_status"       "VendorComplianceStatus" NOT NULL DEFAULT 'NOT_ELIGIBLE',
  ADD COLUMN "fsa_hygiene_rating"      INTEGER,
  ADD COLUMN "fsa_rating_date"         TIMESTAMPTZ,
  ADD COLUMN "fsa_registration_number" VARCHAR(50),
  ADD COLUMN "fsa_last_checked"        TIMESTAMPTZ,
  ADD COLUMN "fhrs_id"                 VARCHAR(20);

-- Backfill from vendor_verifications: RATED with fhrs_rating >= 3.
UPDATE "vendors" v
SET
  "compliance_status"   = 'RATED',
  "fsa_hygiene_rating"  = vv."fhrs_rating",
  "fsa_rating_date"     = vv."fhrs_rating_checked_at",
  "fsa_last_checked"    = vv."updated_at"
FROM "vendor_verifications" vv
WHERE vv."vendor_id"             = v."id"
  AND vv."fhrs_inspection_status" = 'RATED'
  AND vv."fhrs_rating"           >= 3;

-- Backfill: awaiting first inspection (must not remain NOT_ELIGIBLE, but also
-- must not be RATED - they are set up and waiting for the council to visit).
UPDATE "vendors" v
SET "compliance_status" = 'REGISTERED_AWAITING_INSPECTION'
FROM "vendor_verifications" vv
WHERE vv."vendor_id"              = v."id"
  AND vv."fhrs_inspection_status" = 'AWAITING_FIRST_INSPECTION'
  AND v."compliance_status"       = 'NOT_ELIGIBLE';
