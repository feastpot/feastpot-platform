CREATE TYPE "VendorOnboardingStepName" AS ENUM (
  'food_business_registration',
  'public_liability_insurance',
  'food_safety_certificate',
  'photo_id_verification',
  'stripe_connect',
  'vendor_terms',
  'tax_profile',
  'allergen_declared_menu_item',
  'fhrs_eligibility',
  'menu_photography',
  'optional_profile_content',
  'vendor_pro_subscription'
);

CREATE TYPE "VendorOnboardingStepState" AS ENUM (
  'not_started',
  'in_progress',
  'submitted',
  'verified',
  'rejected'
);

ALTER TABLE "vendor_verifications"
  ADD COLUMN "insurance_cover_pence" INTEGER;

CREATE TABLE "vendor_onboarding_steps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "name" "VendorOnboardingStepName" NOT NULL,
  "state" "VendorOnboardingStepState" NOT NULL DEFAULT 'not_started',
  "blocks_progress" BOOLEAN NOT NULL,
  "blocks_publication" BOOLEAN NOT NULL,
  "source_citation" VARCHAR(500) NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "vendor_onboarding_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_onboarding_steps_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "vendor_onboarding_steps_vendor_id_name_key"
  ON "vendor_onboarding_steps"("vendor_id", "name");

CREATE INDEX "vendor_onboarding_steps_vendor_id_blocks_publication_state_idx"
  ON "vendor_onboarding_steps"("vendor_id", "blocks_publication", "state");