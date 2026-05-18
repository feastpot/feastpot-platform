-- Switch the default for menu_items.is_available from TRUE to FALSE so newly
-- created items land in draft mode unless the vendor explicitly publishes
-- them. Existing rows are NOT touched - their current published state is
-- preserved.
ALTER TABLE "menu_items" ALTER COLUMN "is_available" SET DEFAULT false;
