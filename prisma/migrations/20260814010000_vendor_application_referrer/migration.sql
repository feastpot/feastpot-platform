-- Store the referring vendor's ID on vendor_applications so it survives until
-- admin approval (which may happen days later in a different session).
-- The approval flow reads this column and writes referred_by_vendor_id on the
-- newly created vendors row, activating the founding-offer referral bonus.
--
-- No FK constraint: the column is intentionally a plain UUID so a referrer
-- vendor that is later deleted does not cascade to application rows.
ALTER TABLE vendor_applications
  ADD COLUMN IF NOT EXISTS referrer_vendor_id UUID;

COMMENT ON COLUMN vendor_applications.referrer_vendor_id IS
  'Vendor who referred this applicant via their referral link (fp_ref cookie). Captured once at submission; null if no referral. Never overwritten.';
