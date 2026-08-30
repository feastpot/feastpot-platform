-- Keep a recoverable record whenever a legacy published item is hidden because
-- it has neither declared allergens nor an explicit free-from-all-14 claim.
CREATE TABLE IF NOT EXISTS "menu_item_allergen_remediations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "menu_item_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "prior_is_available" BOOLEAN NOT NULL,
    "remediated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "notification_queued_at" TIMESTAMPTZ,
    CONSTRAINT "menu_item_allergen_remediations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_allergen_remediations_menu_item_id_key"
  ON "menu_item_allergen_remediations"("menu_item_id");
CREATE INDEX IF NOT EXISTS "menu_item_allergen_remediations_vendor_id_resolved_at_idx"
  ON "menu_item_allergen_remediations"("vendor_id", "resolved_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'menu_item_allergen_remediations_menu_item_id_fkey'
  ) THEN
    ALTER TABLE "menu_item_allergen_remediations"
      ADD CONSTRAINT "menu_item_allergen_remediations_menu_item_id_fkey"
      FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'menu_item_allergen_remediations_vendor_id_fkey'
  ) THEN
    ALTER TABLE "menu_item_allergen_remediations"
      ADD CONSTRAINT "menu_item_allergen_remediations_vendor_id_fkey"
      FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "public"."menu_item_allergen_remediations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."menu_item_allergen_remediations" FORCE ROW LEVEL SECURITY;

-- This table is internal audit metadata. No anon/authenticated policy is
-- created, so direct clients cannot inspect it.

DROP POLICY IF EXISTS "menu_items_public_read" ON "public"."menu_items";
CREATE POLICY "menu_items_public_read"
  ON "public"."menu_items"
  FOR SELECT
  TO anon, authenticated
  USING (
    is_available = true
    AND moderation_status IN ('auto_approved', 'approved')
    AND (cardinality(allergens) > 0 OR allergens_free_from = true)
    AND EXISTS (
      SELECT 1
      FROM "public"."vendors" v
      WHERE v.id = "menu_items".vendor_id
        AND v.status IN ('approved', 'live')
    )
    AND EXISTS (
      SELECT 1
      FROM "public"."menus" m
      WHERE m.id = "menu_items".menu_id
        AND m.is_active = true
    )
  );