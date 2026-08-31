-- Keep the effective Vendor Terms current while v2.0 is still in its notice period.
-- This is deliberately data-driven and idempotent: it only repairs a document type
-- that otherwise has no unsuperseded effective version.
UPDATE "terms_versions" AS effective
SET "superseded_at" = NULL
WHERE effective."document_type" = 'VENDOR_TERMS'::"TermsDocumentType"
  AND effective."effective_at" <= CURRENT_TIMESTAMP
  AND effective."id" = (
    SELECT candidate."id"
    FROM "terms_versions" AS candidate
    WHERE candidate."document_type" = effective."document_type"
      AND candidate."effective_at" <= CURRENT_TIMESTAMP
    ORDER BY candidate."effective_at" DESC, candidate."published_at" DESC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "terms_versions" AS current_version
    WHERE current_version."document_type" = effective."document_type"
      AND current_version."effective_at" <= CURRENT_TIMESTAMP
      AND current_version."superseded_at" IS NULL
  );

ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "terms_activated_at" TIMESTAMPTZ;

-- Ensure already-operational vendors see the pending material-version countdown
-- even when that version was published before this migration was deployed.
INSERT INTO "terms_notices" (
  "id",
  "vendor_id",
  "terms_version_id",
  "sent_at",
  "channel",
  "delivered_at"
)
SELECT
  'terms-backfill-' || vendor."id"::text || '-' || version."id",
  vendor."id",
  version."id",
  CURRENT_TIMESTAMP,
  'DASHBOARD'::"NoticeChannel",
  CURRENT_TIMESTAMP
FROM "vendors" AS vendor
CROSS JOIN "terms_versions" AS version
WHERE vendor."status" IN ('live', 'probation', 'suspended')
  AND version."document_type" = 'VENDOR_TERMS'::"TermsDocumentType"
  AND version."is_material" = TRUE
  AND version."effective_at" > CURRENT_TIMESTAMP
  AND NOT EXISTS (
    SELECT 1
    FROM "terms_notices" AS notice
    WHERE notice."vendor_id" = vendor."id"
      AND notice."terms_version_id" = version."id"
      AND notice."channel" = 'DASHBOARD'::"NoticeChannel"
  );

-- Click-wrap evidence must be complete. Deemed acceptance has no originating
-- browser request, so request metadata is intentionally not required for it.
ALTER TABLE "terms_acceptances"
  DROP CONSTRAINT IF EXISTS "terms_acceptances_clickwrap_evidence_check";

ALTER TABLE "terms_acceptances"
  ADD CONSTRAINT "terms_acceptances_clickwrap_evidence_check"
  CHECK (
    "method" <> 'CLICKWRAP'::"AcceptanceMethod"
    OR (
      "ip_address" IS NOT NULL
      AND "user_agent" IS NOT NULL
      AND "acceptance_text" IS NOT NULL
      AND "content_hash" IS NOT NULL
      AND "scrolled_to_end" = TRUE
    )
  );