-- Enforce one waitlist row per (email, postcode) at the database level so the
-- public POST /coverage-interest dedupe is atomic under concurrent submissions
-- (replaces the application-level read-then-write check). Also drops the now
-- redundant standalone email index — the composite unique index covers
-- email-prefixed lookups.
DROP INDEX IF EXISTS "coverage_interests_email_idx";

CREATE UNIQUE INDEX "coverage_interests_email_postcode_key" ON "coverage_interests"("email", "postcode");
