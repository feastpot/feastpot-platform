-- Scale indexes for 500-vendor / 10k-orders-per-day workload.
--
-- All indexes are created CONCURRENTLY and use IF NOT EXISTS so the
-- migration is safe to re-run and won't take a long table lock on the
-- production database. Prisma's migration engine wraps statements in a
-- transaction by default, but CONCURRENT index builds cannot run in a
-- transaction — so we mark this migration as "no transaction" via the
-- migration.toml sibling file (see `--add-no-transaction` if rerunning
-- via prisma migrate dev).
--
-- Why these specific indexes:
--   - vendors(status, avg_rating DESC) WHERE status='live'
--       Customer-facing search hits this hundreds of times per minute at
--       peak. Partial index keeps it tiny (only the ~500 live vendors)
--       and pre-sorts by rating so default-sort scans are index-only.
--   - vendors USING GIN(cuisine_types)
--       Enables `cuisine_types @> ARRAY['nigerian']` containment without
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

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendors_status_rating
  ON vendors(status, avg_rating DESC)
  WHERE status = 'live';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendors_cuisine_gin
  ON vendors USING GIN(cuisine_types);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_vendor_status
  ON orders(vendor_id, status, created_at DESC)
  WHERE status NOT IN ('delivered', 'cancelled');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_created
  ON orders(customer_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_menu_items_vendor_available
  ON menu_items(vendor_id, is_available)
  WHERE is_available = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loyalty_points_user_id
  ON loyalty_points(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discount_codes_code_active
  ON discount_codes(UPPER(code))
  WHERE is_active = true;
