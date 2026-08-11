-- GIN index on MenuItem.allergens for fast && overlap queries used by the
-- allergenFree vendor-search filter. The negated-overlap predicate
-- (NOT allergens && $slugs) benefits from the vendor-scoped EXISTS subquery
-- narrowing rows before the array check; the GIN index accelerates the
-- positive-overlap path and reduces scan cost on the per-vendor slice.
CREATE INDEX IF NOT EXISTS "menuitem_allergens_gin" ON "menu_items" USING GIN ("allergens");
