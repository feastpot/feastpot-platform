-- Scale indexes for 500-vendor / 10k-orders-per-day workload.
--
-- IMPORTANT - why no CONCURRENTLY:
-- Prisma's `migrate deploy` engine wraps every migration file in a single
-- transaction, and Postgres rejects `CREATE INDEX CONCURRENTLY` inside a
-- transaction (SQLSTATE 25001). The first attempt of this migration used
-- CONCURRENTLY and got stuck in `_prisma_migrations` as failed (P3009),
-- which blocked every subsequent deploy.
--
-- Plain `CREATE INDEX` takes a short ACCESS EXCLUSIVE lock on the target
-- table for the duration of the build. At our current scale (vendors,
-- menu_items, discount_codes, loyalty_points are small; orders is the
-- largest but still well under a million rows pre-launch) every index
-- here builds in well under a second, so the lock window is acceptable.
-- If/when `orders` grows past a few million rows, follow up by running
-- the index rebuilds manually via psql with CONCURRENTLY (see Prisma's
-- "Customizing migrations" docs) and recording the result with
-- `prisma migrate resolve --applied`.
--
-- DROP IF EXISTS in front of each CREATE: defensively cleans up any
-- INVALID leftovers from the prior failed CONCURRENTLY attempt so the
-- replacement build is guaranteed to succeed and to be valid.
--
-- Why these specific indexes:
--   - vendors(status, rating DESC) WHERE status='live'
--       Customer-facing search hits this hundreds of times per minute at
--       peak. Partial index keeps it tiny (only the ~500 live vendors)
--       and pre-sorts by rating so default-sort scans are index-only.
--   - vendors USING GIN(cuisines)
--       Enables `cuisines @> ARRAY['nigerian']` containment without
--       a seq scan as the vendor table grows.
--   - orders(vendor_id, status, created_at DESC) WHERE NOT terminal
--       Vendor dashboard polls active orders every few seconds across
--       500 vendors; partial index keeps the hot set small.
--   - orders(customer_id, created_at DESC)
--       Customer account / tracking pages.
--   - menu_items(vendor_id, is_available) WHERE is_available
--       Profile page menu render.
--   - loyalty_points(user_id, created_at DESC)
--       Checkout-time balance aggregate.
--   - discount_codes(UPPER(code)) WHERE is_active
--       Case-insensitive code lookup on /validate.

DROP INDEX IF EXISTS idx_vendors_status_rating;
CREATE INDEX idx_vendors_status_rating
  ON vendors(status, rating DESC)
  WHERE status = 'live';

DROP INDEX IF EXISTS idx_vendors_cuisine_gin;
CREATE INDEX idx_vendors_cuisine_gin
  ON vendors USING GIN(cuisines);

DROP INDEX IF EXISTS idx_orders_vendor_status;
CREATE INDEX idx_orders_vendor_status
  ON orders(vendor_id, status, created_at DESC)
  WHERE status NOT IN ('delivered', 'cancelled');

DROP INDEX IF EXISTS idx_orders_customer_created;
CREATE INDEX idx_orders_customer_created
  ON orders(customer_id, created_at DESC);

DROP INDEX IF EXISTS idx_menu_items_vendor_available;
CREATE INDEX idx_menu_items_vendor_available
  ON menu_items(vendor_id, is_available)
  WHERE is_available = true;

DROP INDEX IF EXISTS idx_loyalty_points_user_id;
CREATE INDEX idx_loyalty_points_user_id
  ON loyalty_points(user_id, created_at DESC);

DROP INDEX IF EXISTS idx_discount_codes_code_active;
CREATE INDEX idx_discount_codes_code_active
  ON discount_codes(UPPER(code))
  WHERE is_active = true;
