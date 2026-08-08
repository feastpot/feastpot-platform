-- LEGAL-500: Extend terms tables for full click-wrap audit trail.
-- Adds contentMdx, isMaterial, supersededAt, createdBy, solicitorSignOff to
-- terms_versions and adds userAgent, acceptanceText, contentHash,
-- scrolledToEnd, method (new AcceptanceMethod enum) to terms_acceptances.
-- Also extends TermsDocumentType with COOKIES, ALLERGENS, RATE_SCHEDULE.

-- 1. Extend TermsDocumentType enum
ALTER TYPE "TermsDocumentType" ADD VALUE IF NOT EXISTS 'COOKIES';
ALTER TYPE "TermsDocumentType" ADD VALUE IF NOT EXISTS 'ALLERGENS';
ALTER TYPE "TermsDocumentType" ADD VALUE IF NOT EXISTS 'RATE_SCHEDULE';

-- 2. AcceptanceMethod enum (new)
DO $$ BEGIN
  CREATE TYPE "AcceptanceMethod" AS ENUM ('CLICKWRAP', 'ESIGNATURE', 'DEEMED_CONTINUED_USE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Extend terms_versions
ALTER TABLE "terms_versions"
  ADD COLUMN IF NOT EXISTS "content_mdx"       TEXT         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "change_summary"    TEXT         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "is_material"       BOOLEAN      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "superseded_at"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "created_by"        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "solicitor_sign_off" TEXT;

-- Back-fill change_summary from existing summary column (kept for rollback safety;
-- the ORM model uses changeSummary, the old summary column stays as-is in the DB
-- so existing data is not lost).
UPDATE "terms_versions" SET "change_summary" = "summary" WHERE "change_summary" = '';

-- 4. Extend terms_acceptances
ALTER TABLE "terms_acceptances"
  ADD COLUMN IF NOT EXISTS "user_agent"       TEXT,
  ADD COLUMN IF NOT EXISTS "acceptance_text"  TEXT,
  ADD COLUMN IF NOT EXISTS "content_hash"     VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "scrolled_to_end"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "method"           "AcceptanceMethod" NOT NULL DEFAULT 'CLICKWRAP';

-- 5. Indexes added by Prisma schema (@@index directives)
CREATE INDEX IF NOT EXISTS "terms_versions_effective_at_idx"
  ON "terms_versions"("effective_at");

CREATE INDEX IF NOT EXISTS "terms_acceptances_vendor_id_accepted_at_idx"
  ON "terms_acceptances"("vendor_id", "accepted_at");
