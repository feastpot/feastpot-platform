-- Email suppression: two changes.
--
-- 1. Add skipped_suppressed to the NotificationStatus enum so the processor
--    can record a permanent-skip without pushing the row to the dead-letter
--    queue (which is reserved for transient failures).
--
-- 2. Add a functional index on lower("to") WHERE suppressed = true so the
--    pre-send suppression check is a single fast index scan even with millions
--    of email_events rows.  Also normalise future writes: existing rows are
--    updated to lower-trimmed addresses so old hard-bounce records suppress
--    the same address written with a different case.

-- (1) Extend the enum.  Postgres requires ADD VALUE outside a transaction for
--     enum changes, so this migration runs without an explicit transaction.
-- Idempotent guard: only add the value if it does not already exist.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'skipped_suppressed'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationStatus')
  ) THEN
    ALTER TYPE "NotificationStatus" ADD VALUE 'skipped_suppressed';
  END IF;
END $$;

-- (2a) Normalise existing rows so old records match case-insensitively.
UPDATE email_events
SET "to" = LOWER(TRIM("to"))
WHERE "to" <> LOWER(TRIM("to"));

-- (2b) Partial functional index: suppression lookups hit only the small
--      suppressed=true subset, and LOWER() makes them case-insensitive.
CREATE INDEX IF NOT EXISTS email_events_suppressed_lower_to_idx
  ON email_events (LOWER("to"))
  WHERE suppressed = true;
