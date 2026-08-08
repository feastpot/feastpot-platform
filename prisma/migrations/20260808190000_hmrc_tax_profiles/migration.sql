-- HMRC digital platform reporting (Platform Operators Regulations 2023, SI 2023/817)
-- Adds VendorTaxProfile and PlatformReport tables required for annual reporting.

-- CreateEnum
CREATE TYPE "TaxEntityType" AS ENUM ('SOLE_TRADER', 'LIMITED_COMPANY', 'PARTNERSHIP');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'EXEMPT');

-- CreateTable: vendor_tax_profiles
-- Stores the due-diligence information collected from each seller under SI 2023/817.
-- Fields already captured by Stripe KYC are pre-filled via the /from-stripe endpoint;
-- vendors only need to supply the gaps (tax identifier, date of birth for sole traders).
CREATE TABLE "vendor_tax_profiles" (
  "id"                   UUID          NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id"            UUID          NOT NULL,
  "entity_type"          "TaxEntityType"  NOT NULL,
  "legal_name"           VARCHAR(255)  NOT NULL,
  "trading_name"         VARCHAR(255),
  "address_line1"        VARCHAR(255)  NOT NULL,
  "address_line2"        VARCHAR(255),
  "city"                 VARCHAR(100)  NOT NULL,
  "postcode"             VARCHAR(20)   NOT NULL,
  "country"              VARCHAR(2)    NOT NULL DEFAULT 'GB',
  "date_of_birth"        DATE,
  "company_number"       VARCHAR(20),
  "tax_identifier"       VARCHAR(50),
  "tax_id_country"       VARCHAR(2)    NOT NULL DEFAULT 'GB',
  "vat_number"           VARCHAR(30),
  "financial_account_id" VARCHAR(100),
  "account_holder_name"  VARCHAR(255),
  "verification_status"  "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  "verification_method"  VARCHAR(100),
  "verified_at"          TIMESTAMPTZ,
  "verified_by_id"       UUID,
  "last_reviewed_at"     TIMESTAMPTZ,
  "created_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "vendor_tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform_reports
-- One row per (vendor, reportingYear). Stores the computed figures for the HMRC
-- submission and tracks whether the annual copy has been sent to the vendor.
CREATE TABLE "platform_reports" (
  "id"                   UUID          NOT NULL DEFAULT gen_random_uuid(),
  "reporting_year"       INTEGER       NOT NULL,
  "vendor_id"            UUID          NOT NULL,
  "gross_pence"          INTEGER       NOT NULL,
  "fees_pence"           INTEGER       NOT NULL,
  "order_count"          INTEGER       NOT NULL,
  "quarterly_breakdown"  JSONB         NOT NULL,
  "reported_at"          TIMESTAMPTZ,
  "copy_sent_at"         TIMESTAMPTZ,
  "created_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "platform_reports_pkey" PRIMARY KEY ("id")
);

-- FK: vendor_tax_profiles -> vendors
ALTER TABLE "vendor_tax_profiles"
  ADD CONSTRAINT "vendor_tax_profiles_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: platform_reports -> vendors
ALTER TABLE "platform_reports"
  ADD CONSTRAINT "platform_reports_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique: one tax profile per vendor
CREATE UNIQUE INDEX "vendor_tax_profiles_vendor_id_key"
  ON "vendor_tax_profiles"("vendor_id");

-- Unique: one report row per (year, vendor) so upsert on conflict is safe
CREATE UNIQUE INDEX "platform_reports_reporting_year_vendor_id_key"
  ON "platform_reports"("reporting_year", "vendor_id");

-- Indexes
CREATE INDEX "vendor_tax_profiles_verification_status_idx"
  ON "vendor_tax_profiles"("verification_status");

CREATE INDEX "platform_reports_reporting_year_idx"
  ON "platform_reports"("reporting_year");
