-- Migration: 20260818140000_schema_drift_cleanup_part3
--
-- Corrects the referral_clicks FK rule that was set to RESTRICT in part 1
-- before the schema was updated to carry onDelete: Cascade explicitly.
-- CASCADE is the correct semantic: removing a referral link should auto-remove
-- its associated click rows (no orphans, no blocked deletes).
--
-- All statements are idempotent.

ALTER TABLE referral_clicks
  DROP CONSTRAINT IF EXISTS "referral_clicks_referral_link_id_fkey";

ALTER TABLE referral_clicks
  ADD CONSTRAINT "referral_clicks_referral_link_id_fkey"
  FOREIGN KEY ("referral_link_id")
  REFERENCES "vendor_referral_links" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
