-- Keep legacy client IDs as explicitly non-authoritative diagnostic context.
-- They have no foreign keys and are never used to derive incident ownership.
ALTER TABLE error_incidents
  ADD COLUMN IF NOT EXISTS client_vendor_id UUID,
  ADD COLUMN IF NOT EXISTS client_user_id UUID;