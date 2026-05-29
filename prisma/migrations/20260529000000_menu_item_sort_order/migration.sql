-- Add a manual display order to menu items so vendors can drag-to-reorder.
-- Existing rows are backfilled per-menu to preserve the order they currently
-- render in (category, then name), so the migration is visually a no-op until a
-- vendor actually drags something.
ALTER TABLE "menu_items"
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY menu_id ORDER BY category ASC, name ASC) AS rn
  FROM "menu_items"
)
UPDATE "menu_items" m
SET "sort_order" = o.rn
FROM ordered o
WHERE m.id = o.id;

CREATE INDEX "menu_items_menu_id_sort_order_idx"
  ON "menu_items" ("menu_id", "sort_order");
