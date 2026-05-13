-- Enforce at most one pending amendment per order at the DB layer.
-- Application-level findFirst+create is racy under concurrent vendor requests;
-- this partial unique index closes that gap.

CREATE UNIQUE INDEX IF NOT EXISTS "order_amendments_one_pending_per_order"
  ON "order_amendments"("order_id")
  WHERE "status" = 'pending';
