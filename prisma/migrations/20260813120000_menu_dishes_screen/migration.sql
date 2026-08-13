-- Migration: 20260813120000_menu_dishes_screen
--
-- 1. Add allergens_free_from to menu_items so vendors can affirmatively declare
--    that a dish contains none of the FSA 14 major allergens. An empty
--    allergens array without this flag means "unknown" (not declared safe).
--
-- 2. Consolidate vendors with multiple menus: move all MenuItems onto the
--    vendor's oldest active menu and deactivate the extras. Items are never
--    deleted. A log table records every row that moved so the operation can be
--    reversed by setting menu_id back to from_menu_id.

-- Step 1: new column
ALTER TABLE "public"."menu_items"
  ADD COLUMN IF NOT EXISTS "allergens_free_from" BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2: audit log for the consolidation (no RLS needed; service-only table)
CREATE TABLE IF NOT EXISTS "public"."_menu_consolidation_log" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "item_id"      UUID        NOT NULL,
  "from_menu_id" UUID        NOT NULL,
  "to_menu_id"   UUID        NOT NULL,
  "vendor_id"    UUID        NOT NULL,
  "migrated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 3: for each vendor with more than one active menu, consolidate onto
--         the oldest active menu and deactivate the rest.
DO $$
DECLARE
  v_vendor_id      UUID;
  v_primary_id     UUID;
BEGIN
  FOR v_vendor_id IN (
    SELECT vendor_id
    FROM   "public"."menus"
    WHERE  is_active = TRUE
    GROUP  BY vendor_id
    HAVING COUNT(*) > 1
  ) LOOP
    -- Oldest active menu is the canonical primary
    SELECT id INTO v_primary_id
    FROM   "public"."menus"
    WHERE  vendor_id = v_vendor_id
      AND  is_active = TRUE
    ORDER  BY created_at ASC
    LIMIT  1;

    -- Log every item that will change menu
    INSERT INTO "public"."_menu_consolidation_log"
           (item_id, from_menu_id, to_menu_id, vendor_id)
    SELECT id, menu_id, v_primary_id, vendor_id
    FROM   "public"."menu_items"
    WHERE  vendor_id = v_vendor_id
      AND  menu_id  != v_primary_id;

    -- Move them
    UPDATE "public"."menu_items"
    SET    menu_id = v_primary_id
    WHERE  vendor_id = v_vendor_id
      AND  menu_id  != v_primary_id;

    -- Deactivate every non-primary active menu for this vendor
    UPDATE "public"."menus"
    SET    is_active = FALSE
    WHERE  vendor_id = v_vendor_id
      AND  id       != v_primary_id
      AND  is_active = TRUE;
  END LOOP;
END $$;
