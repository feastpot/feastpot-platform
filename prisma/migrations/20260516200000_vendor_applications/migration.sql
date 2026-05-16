-- CreateEnum
CREATE TYPE "VendorApplicationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "vendor_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" VARCHAR(255) NOT NULL,
    "kitchen_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "postcode" VARCHAR(16) NOT NULL,
    "cuisine_type" VARCHAR(64) NOT NULL,
    "kitchen_type" VARCHAR(40) NOT NULL,
    "has_fsa_registration" BOOLEAN NOT NULL,
    "foodStory" TEXT NOT NULL,
    "instagram" VARCHAR(255),
    "marketing_consent" BOOLEAN NOT NULL DEFAULT true,
    "status" "VendorApplicationStatus" NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMPTZ,
    "reviewed_by_id" UUID,
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vendor_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_applications_status_created_at_idx" ON "vendor_applications"("status", "created_at");

-- CreateIndex
CREATE INDEX "vendor_applications_email_idx" ON "vendor_applications"("email");

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
