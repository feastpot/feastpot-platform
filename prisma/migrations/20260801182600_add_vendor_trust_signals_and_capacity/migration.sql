-- Trust-signal + capacity data layer.
-- Native Postgres enums (repo convention) rather than CHECK constraints for
-- the allowed-value lists; numeric invariants use CHECK constraints.

CREATE TYPE "vendor_trust_signal_type" AS ENUM (
  'food_business_registration',
  'hygiene_rating',
  'identity_check',
  'allergen_information',
  'delivery_coverage',
  'event_catering_experience',
  'reliable_orders'
);

CREATE TYPE "vendor_trust_signal_status" AS ENUM (
  'not_provided',
  'submitted',
  'verified',
  'expired'
);

CREATE TYPE "vendor_capacity_type" AS ENUM (
  'family_pot',
  'party_tray',
  'event_catering',
  'meal_prep'
);

CREATE TABLE "vendor_trust_signals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "signal_type" "vendor_trust_signal_type" NOT NULL,
  "status" "vendor_trust_signal_status" NOT NULL DEFAULT 'not_provided',
  "evidence_reference" TEXT,
  "verified_at" TIMESTAMPTZ,
  "verified_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "vendor_trust_signals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_trust_signals_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vendor_trust_signals_verified_by_fkey"
    FOREIGN KEY ("verified_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "vendor_trust_signals_vendor_id_signal_type_key"
  ON "vendor_trust_signals"("vendor_id", "signal_type");
CREATE INDEX "vendor_trust_signals_vendor_id_status_idx"
  ON "vendor_trust_signals"("vendor_id", "status");

CREATE TABLE "vendor_capacity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "service_date" DATE NOT NULL,
  "capacity_type" "vendor_capacity_type" NOT NULL,
  "total_slots" INTEGER NOT NULL,
  "slots_taken" INTEGER NOT NULL DEFAULT 0,
  "preorder_cutoff_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "vendor_capacity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_capacity_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vendor_capacity_total_slots_positive_chk"
    CHECK ("total_slots" > 0),
  CONSTRAINT "vendor_capacity_slots_taken_range_chk"
    CHECK ("slots_taken" >= 0 AND "slots_taken" <= "total_slots")
);

CREATE UNIQUE INDEX "vendor_capacity_vendor_id_service_date_capacity_type_key"
  ON "vendor_capacity"("vendor_id", "service_date", "capacity_type");

-- RLS: repo convention locks down all public tables (service-role access via
-- the API only). Matches scripts/enable-rls-on-public-tables.sql.
ALTER TABLE "vendor_trust_signals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_trust_signals" FORCE ROW LEVEL SECURITY;
ALTER TABLE "vendor_capacity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_capacity" FORCE ROW LEVEL SECURITY;
