-- Preserve a machine-readable expiry audit on public catering intake rows.
-- Status remains VARCHAR intentionally: this table predates Prisma enums.
ALTER TABLE "catering_enquiries"
  ADD COLUMN "expired_at" TIMESTAMPTZ,
  ADD COLUMN "expiry_reason" VARCHAR(100);

CREATE INDEX "catering_enquiries_expired_at_idx"
  ON "catering_enquiries" ("expired_at")
  WHERE "status" = 'EXPIRED';