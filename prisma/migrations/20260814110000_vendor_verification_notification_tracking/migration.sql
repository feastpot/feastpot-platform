-- Track which state was last notified on each VendorVerification row so that:
--   a) support can answer "was this vendor told?" definitively
--   b) the service can deduplicate: a repeated upsert to the same state
--      within a short window does not send a second email
--
-- last_notified_state:   VerificationState value most recently emailed
-- last_notified_at:      timestamp of that send
-- last_notified_channel: 'email' for now; 'whatsapp' when Prompt 47 lands

ALTER TABLE vendor_verifications
  ADD COLUMN IF NOT EXISTS last_notified_state "VerificationState",
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_notified_channel VARCHAR(20);
