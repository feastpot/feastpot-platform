CREATE TABLE IF NOT EXISTS "menu_item_allergen_remediations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "menu_item_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "prior_is_available" BOOLEAN NOT NULL,
  "remediated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ,
  "notification_queued_at" TIMESTAMPTZ,
  CONSTRAINT "menu_item_allergen_remediations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menu_item_allergen_remediations_menu_item_id_key" UNIQUE ("menu_item_id"),
  CONSTRAINT "menu_item_allergen_remediations_menu_item_id_fkey"
    FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "menu_item_allergen_remediations_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "menu_item_allergen_remediations_vendor_id_resolved_at_idx"
  ON "menu_item_allergen_remediations"("vendor_id", "resolved_at");

ALTER TABLE "menu_item_allergen_remediations" ENABLE ROW LEVEL SECURITY;

INSERT INTO "menu_item_allergen_remediations" (
  "menu_item_id",
  "vendor_id",
  "prior_is_available"
)
SELECT
  mi."id",
  mi."vendor_id",
  mi."is_available"
FROM "menu_items" mi
WHERE mi."is_available" = true
  AND mi."moderation_status" IN ('auto_approved', 'approved')
  AND COALESCE(array_length(mi."allergens", 1), 0) = 0
  AND mi."allergens_free_from" = false
ON CONFLICT ("menu_item_id") DO NOTHING;

UPDATE "menu_items"
SET "is_available" = false,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "is_available" = true
  AND "moderation_status" IN ('auto_approved', 'approved')
  AND COALESCE(array_length("allergens", 1), 0) = 0
  AND "allergens_free_from" = false;