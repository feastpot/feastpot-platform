-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('MARKETPLACE', 'VENDOR_REFERRED');

-- CreateTable
CREATE TABLE "vendor_referral_links" (
    "id" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "qr_code_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "vendor_referral_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_clicks" (
    "id" TEXT NOT NULL,
    "referral_link_id" TEXT NOT NULL,
    "session_id" VARCHAR(128) NOT NULL,
    "user_id" UUID,
    "ip_hash" VARCHAR(64) NOT NULL,
    "user_agent" TEXT,
    "clicked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "referral_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_attributions" (
    "id" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "source" "OrderSource" NOT NULL,
    "referral_link_id" TEXT,
    "referral_click_id" TEXT,
    "is_first_order" BOOLEAN NOT NULL,
    "attributed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "attribution_reason" VARCHAR(64) NOT NULL,

    CONSTRAINT "order_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_referral_links_vendor_id_key" ON "vendor_referral_links"("vendor_id");
CREATE UNIQUE INDEX "vendor_referral_links_slug_key" ON "vendor_referral_links"("slug");

-- CreateIndex
CREATE INDEX "referral_clicks_session_id_clicked_at_idx" ON "referral_clicks"("session_id", "clicked_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_attributions_order_id_key" ON "order_attributions"("order_id");
CREATE INDEX "order_attributions_source_attributed_at_idx" ON "order_attributions"("source", "attributed_at");

-- AddForeignKey
ALTER TABLE "vendor_referral_links" ADD CONSTRAINT "vendor_referral_links_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_clicks" ADD CONSTRAINT "referral_clicks_referral_link_id_fkey"
    FOREIGN KEY ("referral_link_id") REFERENCES "vendor_referral_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_attributions" ADD CONSTRAINT "order_attributions_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
