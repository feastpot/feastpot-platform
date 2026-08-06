-- CreateEnum
CREATE TYPE "TermsDocumentType" AS ENUM ('VENDOR_TERMS', 'CUSTOMER_TERMS', 'PRIVACY');

-- CreateTable
CREATE TABLE "terms_versions" (
    "id" TEXT NOT NULL,
    "document_type" "TermsDocumentType" NOT NULL,
    "version" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ NOT NULL,
    "effective_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "terms_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_acceptances" (
    "id" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "terms_version_id" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "ip_address" TEXT,

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_notices" (
    "id" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "terms_version_id" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "channel" TEXT NOT NULL,
    "delivered_at" TIMESTAMPTZ,

    CONSTRAINT "terms_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "terms_versions_document_type_version_key" ON "terms_versions"("document_type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "terms_acceptances_vendor_id_terms_version_id_key" ON "terms_acceptances"("vendor_id", "terms_version_id");

-- CreateIndex
CREATE INDEX "terms_notices_vendor_id_sent_at_idx" ON "terms_notices"("vendor_id", "sent_at");

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_terms_version_id_fkey" FOREIGN KEY ("terms_version_id") REFERENCES "terms_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_notices" ADD CONSTRAINT "terms_notices_terms_version_id_fkey" FOREIGN KEY ("terms_version_id") REFERENCES "terms_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
