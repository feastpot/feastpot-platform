-- Migration: vendor_enforcement_actions
-- P2B statement of reasons: every suspension/restriction/termination must
-- have a written narrative before taking effect (vendor terms clause 14.1).

CREATE TYPE "EnforcementType" AS ENUM ('RESTRICTION', 'SUSPENSION', 'TERMINATION');

CREATE TABLE "vendor_enforcement_actions" (
  "id"               TEXT          NOT NULL,
  "vendor_id"        UUID          NOT NULL,
  "action_type"      "EnforcementType" NOT NULL,
  "reason_code"      VARCHAR(64)   NOT NULL,
  "reason_narrative" TEXT          NOT NULL,
  "facts"            JSONB         NOT NULL DEFAULT '{}',
  "effective_at"     TIMESTAMPTZ   NOT NULL,
  "notice_sent_at"   TIMESTAMPTZ,
  "urgent_basis"     TEXT,
  "issued_by"        VARCHAR(255)  NOT NULL,
  "appeal_id"        TEXT,
  "lifted_at"        TIMESTAMPTZ,
  "lifted_by"        VARCHAR(255),
  "lift_note"        TEXT,
  "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "vendor_enforcement_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_enforcement_actions_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "vendor_enforcement_actions_vendor_id_created_at_idx"
  ON "vendor_enforcement_actions" ("vendor_id", "created_at");

CREATE INDEX "vendor_enforcement_actions_vendor_id_lifted_at_idx"
  ON "vendor_enforcement_actions" ("vendor_id", "lifted_at");
