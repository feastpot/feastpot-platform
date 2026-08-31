ALTER TABLE "catering_bookings"
  ADD COLUMN IF NOT EXISTS "minimum_deposit_pence" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_quotes'
      AND column_name = 'min_deposit_pct'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_quotes'
      AND column_name = 'legacy_deposit_pct'
  ) THEN
    ALTER TABLE "event_quotes"
      RENAME COLUMN "min_deposit_pct" TO "legacy_deposit_pct";
  END IF;
END
$$;

ALTER TABLE "event_quotes"
  ADD COLUMN IF NOT EXISTS "minimum_deposit_pence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "event_quotes"
  ALTER COLUMN "legacy_deposit_pct" DROP NOT NULL,
  ALTER COLUMN "legacy_deposit_pct" DROP DEFAULT;

UPDATE "catering_bookings"
SET
  "deposit_pence" = LEAST(
    "total_pence",
    CEIL(("total_pence"::numeric * 25) / 100)::integer
  ),
  "balance_pence" = "total_pence" - LEAST(
    "total_pence",
    CEIL(("total_pence"::numeric * 25) / 100)::integer
  )
WHERE
  "total_pence" < 5000
  AND "deposit_pi_id" IS NULL
  AND "status" IN (
    'ASSIGNED'::"catering_booking_status",
    'QUOTED'::"catering_booking_status"
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "catering_bookings"
    WHERE "balance_pence" < 0
  ) THEN
    RAISE EXCEPTION
      'Catering deposit migration blocked: paid or in-progress booking has a negative balance and requires manual remediation';
  END IF;
END
$$;
