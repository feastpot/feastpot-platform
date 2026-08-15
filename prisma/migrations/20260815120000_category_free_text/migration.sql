-- Change menu_items.category from the ItemCategory enum to free-text VARCHAR.
-- The SQL was executed against the database before this file was created;
-- this file records the change for Prisma migration history.
ALTER TABLE menu_items ALTER COLUMN category TYPE VARCHAR(64) USING category::TEXT;
DROP TYPE IF EXISTS "ItemCategory";
