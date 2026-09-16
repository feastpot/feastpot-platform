DO $$ BEGIN CREATE TYPE "VendorRequiredItemState" AS ENUM ('supplied','deferred','outstanding'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RecoveryNudgeStage" AS ENUM ('sms_2h','email_24h','email_3d_help','email_7d_final','admin_chase'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "application_id" UUID, ADD COLUMN IF NOT EXISTS "user_id" UUID;
CREATE INDEX "analytics_events_application_id_created_at_idx" ON "analytics_events" ("application_id", "created_at" DESC);
CREATE INDEX "analytics_events_user_id_created_at_idx" ON "analytics_events" ("user_id", "created_at" DESC);
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "vendor_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "vendor_required_onboarding_items" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "vendor_id" UUID NOT NULL, "name" "VendorOnboardingStepName" NOT NULL, "state" "VendorRequiredItemState" NOT NULL DEFAULT 'outstanding', "supplied_at" TIMESTAMPTZ, "deferred_at" TIMESTAMPTZ, "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "vendor_required_onboarding_items_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "vendor_required_onboarding_items_vendor_id_name_key" ON "vendor_required_onboarding_items" ("vendor_id","name");
CREATE INDEX "vendor_required_onboarding_items_vendor_id_state_idx" ON "vendor_required_onboarding_items" ("vendor_id","state");
ALTER TABLE "vendor_required_onboarding_items" ADD CONSTRAINT "vendor_required_onboarding_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "vendor_recovery_schedules" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "vendor_id" UUID NOT NULL, "targeted_item" "VendorOnboardingStepName" NOT NULL, "last_completed_at" TIMESTAMPTZ, "cancelled_at" TIMESTAMPTZ, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "vendor_recovery_schedules_pkey" PRIMARY KEY ("id"));
CREATE INDEX "vendor_recovery_schedules_vendor_id_cancelled_at_idx" ON "vendor_recovery_schedules" ("vendor_id","cancelled_at");
ALTER TABLE "vendor_recovery_schedules" ADD CONSTRAINT "vendor_recovery_schedules_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "vendor_recovery_stages" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "schedule_id" UUID NOT NULL, "stage" "RecoveryNudgeStage" NOT NULL, "due_at" TIMESTAMPTZ NOT NULL, "sent_at" TIMESTAMPTZ, "skipped_at" TIMESTAMPTZ, "channel" "NotificationChannel" NOT NULL, CONSTRAINT "vendor_recovery_stages_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "vendor_recovery_stages_schedule_id_stage_key" ON "vendor_recovery_stages" ("schedule_id","stage");
CREATE INDEX "vendor_recovery_stages_due_at_sent_at_idx" ON "vendor_recovery_stages" ("due_at","sent_at");
ALTER TABLE "vendor_recovery_stages" ADD CONSTRAINT "vendor_recovery_stages_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "vendor_recovery_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recovery is server-owned operational data.  Supabase clients must not be
-- able to forge supplied states or read other vendors' rows.
ALTER TABLE "vendor_required_onboarding_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_recovery_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_recovery_stages" ENABLE ROW LEVEL SECURITY;
-- No client policies are intentional: deny by default; the API uses the
-- privileged database connection.

-- Existing approved vendors must enter recovery immediately, anchored to
-- approval/creation rather than the first readiness request.
INSERT INTO "vendor_required_onboarding_items" ("vendor_id", "name", "state", "supplied_at")
SELECT v.id, n.name::"VendorOnboardingStepName",
       CASE WHEN s.state = 'verified' THEN 'supplied'::"VendorRequiredItemState"
            ELSE 'outstanding'::"VendorRequiredItemState" END,
       CASE WHEN s.state = 'verified' THEN CURRENT_TIMESTAMP ELSE NULL END
FROM vendors v
CROSS JOIN (VALUES
  ('food_business_registration'), ('public_liability_insurance'),
  ('food_safety_certificate'), ('photo_id_verification'), ('stripe_connect'),
  ('vendor_terms'), ('tax_profile'), ('allergen_declared_menu_item'),
  ('fhrs_eligibility'), ('menu_photography'), ('optional_profile_content'),
  ('vendor_pro_subscription')
) n(name)
LEFT JOIN "vendor_onboarding_steps" s
  ON s.vendor_id = v.id AND s.name = n.name::"VendorOnboardingStepName"
WHERE v.status IN ('approved','live','probation')
ON CONFLICT ("vendor_id","name") DO NOTHING;


CREATE UNIQUE INDEX "vendor_recovery_one_active_campaign_idx"
  ON "vendor_recovery_schedules" ("vendor_id") WHERE "cancelled_at" IS NULL;

CREATE TABLE "vendor_recovery_chases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "item" "VendorOnboardingStepName" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_recovery_chases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_recovery_chases_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vendor_recovery_chases_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "vendor_recovery_chases_vendor_id_created_at_idx" ON "vendor_recovery_chases" ("vendor_id","created_at" DESC);
CREATE INDEX "vendor_recovery_chases_vendor_id_item_created_at_idx" ON "vendor_recovery_chases" ("vendor_id","item","created_at" DESC);
ALTER TABLE "vendor_recovery_chases" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TYPE "VendorRecoveryChaseStatus" AS ENUM ('queued','delivered','skipped','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "vendor_recovery_stages"
  ADD COLUMN IF NOT EXISTS "queued_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "notification_id" UUID;
ALTER TABLE "vendor_recovery_chases"
  ADD COLUMN IF NOT EXISTS "status" "VendorRecoveryChaseStatus" NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS "queued_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "skipped_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "outcome" VARCHAR(500);
