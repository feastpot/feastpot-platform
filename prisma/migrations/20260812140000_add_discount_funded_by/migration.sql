-- Migration: add DiscountFundedBy enum + columns
-- Applied via: npx prisma db execute --file ... (dev DB not baselined)
-- Prod: npx prisma migrate deploy

-- CreateEnum
CREATE TYPE "DiscountFundedBy" AS ENUM ('PLATFORM', 'VENDOR');

-- AlterTable: orders - nullable; NULL valid only when discount_pence = 0.
-- PLATFORM-funded discounts are absorbed by Feastpot and never reduce vendor_payout_pence.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "discount_funded_by" "DiscountFundedBy";

-- AlterTable: discount_codes - all existing codes are platform promos, default PLATFORM.
ALTER TABLE "discount_codes"
  ADD COLUMN IF NOT EXISTS "funded_by" "DiscountFundedBy" NOT NULL DEFAULT 'PLATFORM';

-- Backfill existing orders that have a discount with PLATFORM
-- (all historical discounts are loyalty redemptions or platform promos).
UPDATE "orders"
  SET "discount_funded_by" = 'PLATFORM'
WHERE "discount_pence" > 0
  AND "discount_funded_by" IS NULL;
