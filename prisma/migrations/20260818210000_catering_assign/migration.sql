-- Add ASSIGNED status: vendor routed but has not yet submitted a quote.
-- ADD VALUE cannot run inside a transaction in older PG versions; IF NOT EXISTS
-- makes this migration idempotent on re-run.
ALTER TYPE "catering_booking_status" ADD VALUE IF NOT EXISTS 'ASSIGNED' BEFORE 'QUOTED';

-- Note left by the assigning admin when routing the enquiry.
ALTER TABLE "catering_bookings"
  ADD COLUMN IF NOT EXISTS "assign_note" TEXT;
