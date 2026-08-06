-- CreateEnum
CREATE TYPE "catering_booking_status" AS ENUM ('QUOTED', 'DEPOSIT_PAID', 'CONFIRMED', 'BALANCE_PAID', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateTable: catering_bookings
CREATE TABLE "catering_bookings" (
    "id"                  UUID             NOT NULL DEFAULT gen_random_uuid(),
    "enquiry_id"          UUID             NOT NULL,
    "vendor_id"           UUID             NOT NULL,
    "customer_id"         UUID,
    "customer_email"      VARCHAR(255)     NOT NULL,
    "customer_name"       VARCHAR(200)     NOT NULL,
    "event_date"          TIMESTAMPTZ      NOT NULL,
    "guest_count"         INTEGER          NOT NULL,
    "event_address"       VARCHAR(500),
    "preferred_time"      VARCHAR(64),
    "total_pence"         INTEGER          NOT NULL,
    "deposit_pence"       INTEGER          NOT NULL,
    "balance_pence"       INTEGER          NOT NULL,
    "commission_percent"  DECIMAL(5,2)     NOT NULL,
    "commission_pence"    INTEGER          NOT NULL,
    "commission_rate_id"  TEXT,
    "attribution_source"  VARCHAR(32),
    "status"              "catering_booking_status" NOT NULL DEFAULT 'QUOTED',
    "quote_expires_at"    TIMESTAMPTZ      NOT NULL,
    "deposit_pi_id"       VARCHAR(100),
    "balance_pi_id"       VARCHAR(100),
    "stripe_transfer_id"  VARCHAR(100),
    "deposit_paid_at"     TIMESTAMPTZ,
    "balance_paid_at"     TIMESTAMPTZ,
    "completed_at"        TIMESTAMPTZ,
    "cancelled_at"        TIMESTAMPTZ,
    "cancellation_reason" TEXT,
    "qr_scans"            INTEGER          NOT NULL DEFAULT 0,
    "created_at"          TIMESTAMPTZ      NOT NULL DEFAULT now(),
    "updated_at"          TIMESTAMPTZ      NOT NULL DEFAULT now(),
    CONSTRAINT "catering_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: catering_line_items
CREATE TABLE "catering_line_items" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "booking_id"  UUID         NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity"    INTEGER      NOT NULL,
    "unit_pence"  INTEGER      NOT NULL,
    "allergens"   VARCHAR(64)[] NOT NULL DEFAULT '{}',
    CONSTRAINT "catering_line_items_pkey" PRIMARY KEY ("id")
);

-- Unique index on enquiry_id (one booking per enquiry)
CREATE UNIQUE INDEX "catering_bookings_enquiry_id_key" ON "catering_bookings"("enquiry_id");

-- Composite index for cron + admin queries
CREATE INDEX "catering_bookings_status_event_date_idx" ON "catering_bookings"("status", "event_date");

-- ForeignKey: catering_bookings.enquiry_id -> catering_enquiries.id
ALTER TABLE "catering_bookings" ADD CONSTRAINT "catering_bookings_enquiry_id_fkey"
    FOREIGN KEY ("enquiry_id") REFERENCES "catering_enquiries"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ForeignKey: catering_bookings.vendor_id -> vendors.id
ALTER TABLE "catering_bookings" ADD CONSTRAINT "catering_bookings_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ForeignKey: catering_bookings.customer_id -> users.id (nullable)
ALTER TABLE "catering_bookings" ADD CONSTRAINT "catering_bookings_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ForeignKey: catering_line_items.booking_id -> catering_bookings.id
ALTER TABLE "catering_line_items" ADD CONSTRAINT "catering_line_items_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "catering_bookings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS (policies applied by the shared enable-rls script)
ALTER TABLE "catering_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catering_line_items" ENABLE ROW LEVEL SECURITY;
