-- Add three public intake models: PostcodeWaitlist, VendorRecommendation, CateringEnquiry.
-- Does NOT modify any existing table (orders, payouts, event_enquiries, etc.).

CREATE TABLE "postcode_waitlist" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "postcode"         VARCHAR(16) NOT NULL,
  "outward_code"     VARCHAR(8)  NOT NULL,
  "email"            VARCHAR(255) NOT NULL,
  "whatsapp"         VARCHAR(32),
  "favourite_cuisine" VARCHAR(100),
  "source"           VARCHAR(64) NOT NULL,
  "notified_at"      TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "postcode_waitlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "postcode_waitlist_email_outward_code_key"
  ON "postcode_waitlist"("email", "outward_code");

CREATE INDEX "postcode_waitlist_outward_code_idx"
  ON "postcode_waitlist"("outward_code");

-- ---------------------------------------------------------------------------

CREATE TABLE "vendor_recommendations" (
  "id"                   UUID        NOT NULL DEFAULT gen_random_uuid(),
  "business_name"        VARCHAR(200),
  "instagram_handle"     VARCHAR(120),
  "phone"                VARCHAR(32),
  "outward_code"         VARCHAR(8),
  "recommended_by_email" VARCHAR(255),
  "status"               VARCHAR(32) NOT NULL DEFAULT 'NEW',
  "admin_notes"          TEXT,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "vendor_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendor_recommendation_status_idx"
  ON "vendor_recommendations"("status");

-- ---------------------------------------------------------------------------

CREATE TABLE "catering_enquiries" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "occasion_type"   VARCHAR(100) NOT NULL,
  "guest_count_band" VARCHAR(32) NOT NULL,
  "cuisine_style"   VARCHAR(200),
  "postcode"        VARCHAR(16)  NOT NULL,
  "outward_code"    VARCHAR(8)   NOT NULL,
  "event_date"      VARCHAR(32),
  "preferred_time"  VARCHAR(64),
  "budget_band"     VARCHAR(32),
  "contact_name"    VARCHAR(200) NOT NULL,
  "email"           VARCHAR(255) NOT NULL,
  "phone"           VARCHAR(32),
  "notes"           TEXT,
  "status"          VARCHAR(32)  NOT NULL DEFAULT 'NEW',
  "source"          VARCHAR(64),
  "admin_notes"     TEXT,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "catering_enquiries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "catering_enquiry_status_idx"  ON "catering_enquiries"("status");
CREATE INDEX "catering_enquiry_event_date_idx" ON "catering_enquiries"("event_date");
