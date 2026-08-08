-- CreateEnum
CREATE TYPE "DisputeParty" AS ENUM ('CUSTOMER', 'VENDOR', 'PLATFORM');

-- CreateEnum: formal decision replacing old "decision is final" clause (now appealable)
CREATE TYPE "DisputeDecision" AS ENUM ('UPHELD_CUSTOMER', 'UPHELD_VENDOR', 'PARTIAL');

-- CreateEnum
CREATE TYPE "AppealOutcome" AS ENUM ('UPHELD', 'OVERTURNED', 'PARTIAL');

-- AlterTable: extend disputes with P2B response-window fields and appeal link
ALTER TABLE "disputes"
  ADD COLUMN "vendor_respond_by"       TIMESTAMPTZ,
  ADD COLUMN "platform_respond_by"     TIMESTAMPTZ,
  ADD COLUMN "platform_responded_at"   TIMESTAMPTZ,
  ADD COLUMN "raised_by_party"         "DisputeParty"    NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN "decision"                "DisputeDecision",
  ADD COLUMN "decided_at"              TIMESTAMPTZ,
  ADD COLUMN "decided_by_id"           UUID,
  ADD COLUMN "refund_pence"            INTEGER,
  ADD COLUMN "is_urgent_dispute"       BOOLEAN           NOT NULL DEFAULT FALSE,
  ADD COLUMN "urgent_dispute_reason"   TEXT;

-- CreateTable
CREATE TABLE "dispute_appeals" (
  "id"              UUID      NOT NULL DEFAULT gen_random_uuid(),
  "dispute_id"      UUID      NOT NULL,
  "submitted_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deadline"        TIMESTAMPTZ NOT NULL,
  "grounds"         TEXT      NOT NULL,
  "stage1_by"       UUID,
  "stage1_at"       TIMESTAMPTZ,
  "stage1_outcome"  "AppealOutcome",
  "stage1_reasons"  TEXT,
  "stage2_by"       UUID,
  "stage2_at"       TIMESTAMPTZ,
  "stage2_outcome"  "AppealOutcome",
  "stage2_reasons"  TEXT,

  CONSTRAINT "dispute_appeals_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (cascade so the appeal is removed if the dispute is deleted)
ALTER TABLE "dispute_appeals"
  ADD CONSTRAINT "dispute_appeals_dispute_id_fkey"
  FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "dispute_appeals_dispute_id_key" ON "dispute_appeals"("dispute_id");
