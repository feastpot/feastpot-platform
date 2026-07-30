-- Staff-only order tags. Separate table (not a column on orders) so raw
-- order rows returned to customers can never leak admin labels.
CREATE TABLE IF NOT EXISTS "order_admin_tags" (
    "order_id" UUID NOT NULL,
    "tag" VARCHAR(40) NOT NULL,
    "added_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_admin_tags_pkey" PRIMARY KEY ("order_id","tag"),
    CONSTRAINT "order_admin_tags_order_id_fkey" FOREIGN KEY ("order_id")
        REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "order_admin_tags_tag_idx" ON "order_admin_tags"("tag");

-- RLS: service-role access only, consistent with the rest of the schema.
ALTER TABLE "order_admin_tags" ENABLE ROW LEVEL SECURITY;
