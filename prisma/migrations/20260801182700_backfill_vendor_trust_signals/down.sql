-- Reverses the backfill: removes rows that are still in the pristine
-- backfilled state (status 'not_provided', never touched by an admin or a
-- vendor submission). Rows that have progressed are deliberately kept.
DELETE FROM "vendor_trust_signals"
WHERE "status" = 'not_provided'
  AND "evidence_reference" IS NULL
  AND "verified_at" IS NULL
  AND "verified_by" IS NULL;
