-- Permanent slug-redirect table.  Created when a vendor changes their public
-- URL slug so old QR codes and shared links keep resolving forever.

CREATE TABLE IF NOT EXISTS vendor_slug_redirects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id  UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  old_slug   VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vendor_slug_redirects_old_slug_key UNIQUE (old_slug)
);

CREATE INDEX IF NOT EXISTS vendor_slug_redirects_vendor_id_idx
  ON vendor_slug_redirects(vendor_id);

ALTER TABLE vendor_slug_redirects ENABLE ROW LEVEL SECURITY;

-- Redirects are public look-up data; all writes go through the service role.
CREATE POLICY "vendor_slug_redirects_public_read"
  ON vendor_slug_redirects FOR SELECT USING (true);

-- NOTE: the featured-dishes data reset that originally lived here was moved
-- to 20260813221000_reset_featured_dishes to keep each migration single-purpose.
