-- Migration: Add RateScheduleEntry model and RateStatus enum
-- All commission rates displayed on any surface must come from rate_schedule_entries.
-- The commission service throws if it resolves a PLANNED entry (runtime guard).

-- Create the RateStatus enum
CREATE TYPE "RateStatus" AS ENUM (
  'LIVE',
  'PLANNED',
  'INCENTIVE',
  'CUSTOMER_SIDE',
  'OPTIONAL_ADDON'
);

-- Create the rate_schedule_entries table
CREATE TABLE "rate_schedule_entries" (
    "id"           TEXT            NOT NULL,
    "version_id"   TEXT            NOT NULL,
    "key"          VARCHAR(64)     NOT NULL,
    "label"        VARCHAR(255)    NOT NULL,
    "rate_display" VARCHAR(64)     NOT NULL,
    "rate_value"   DECIMAL(5,2),
    "basis"        VARCHAR(255)    NOT NULL,
    "vat_note"     VARCHAR(255)    NOT NULL,
    "status"       "RateStatus"    NOT NULL,
    "sort_order"   INTEGER         NOT NULL,

    CONSTRAINT "rate_schedule_entries_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one entry per key per version
CREATE UNIQUE INDEX "rate_schedule_entries_version_id_key_key"
    ON "rate_schedule_entries"("version_id", "key");

-- Foreign key to terms_versions
ALTER TABLE "rate_schedule_entries"
    ADD CONSTRAINT "rate_schedule_entries_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "terms_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add rateKey to commission_rates (nullable: existing rows carry null)
ALTER TABLE "commission_rates"
    ADD COLUMN "rate_key" VARCHAR(64);
