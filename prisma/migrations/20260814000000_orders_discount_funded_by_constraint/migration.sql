-- Add a database-level CHECK constraint so no code path, regardless of
-- whether it uses OrdersService, can insert an order with a non-zero discount
-- and an unknown funding source. The application layer guards first (throws
-- DISCOUNT_FUNDED_BY_REQUIRED); this is the backstop.
--
-- Constraint name: orders_discount_funded_by_required (grep-friendly).
--
-- Idempotent: the DO block skips silently if the constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_discount_funded_by_required'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_discount_funded_by_required
      CHECK (discount_pence = 0 OR discount_funded_by IS NOT NULL);
  END IF;
END;
$$;
