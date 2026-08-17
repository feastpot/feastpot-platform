-- Separated from 20260813220000_vendor_slug_redirects to keep each migration
-- single-purpose.  The featured_dishes column previously stored free-text dish
-- names entered by vendors.  The column now stores menu-item IDs (see
-- 20260813210000_add_featured_dishes_column).  Existing name strings cannot be
-- auto-mapped to IDs, so non-empty values are reset.  Vendors re-select their
-- featured dishes from their live menu via the profile form FeaturedDishPicker.

-- Log the count of affected rows so the scale is visible in migrate deploy output.
DO $$
DECLARE
  affected int;
BEGIN
  SELECT count(*) INTO affected
  FROM vendors
  WHERE cardinality(featured_dishes) > 0;
  RAISE NOTICE 'reset_featured_dishes: clearing % vendor record(s) with non-empty featured_dishes', affected;
END;
$$;

-- Idempotent: only updates rows with non-empty arrays.
-- The IS NOT NULL guard handles any environment where the column was added via
-- db push and therefore landed as nullable rather than NOT NULL.
UPDATE vendors
SET    featured_dishes = '{}'
WHERE  featured_dishes IS NOT NULL
  AND  cardinality(featured_dishes) > 0;
