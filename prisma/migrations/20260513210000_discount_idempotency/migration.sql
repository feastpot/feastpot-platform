-- FR-DISC-001 hardening: atomic + idempotent discount redemption.

-- 1) Per-order CAS marker so concurrent confirmOrder calls can't double-increment.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_applied_at" TIMESTAMPTZ;

-- 2) Case-insensitive uniqueness for discount codes. Existing exact-match
--    unique index stays (Prisma needs it), but the functional index below
--    blocks SAVE10 / save10 from coexisting and matches the lookup pattern.
CREATE UNIQUE INDEX IF NOT EXISTS "discount_codes_code_lower_key"
  ON "discount_codes" (LOWER("code"));
