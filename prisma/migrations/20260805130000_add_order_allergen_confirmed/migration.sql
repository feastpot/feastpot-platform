-- Add allergen confirmation audit flag to orders
-- Customers must tick "I have reviewed the allergen information" at checkout.
-- Defaults to false so existing rows are correctly marked as pre-feature.
ALTER TABLE "orders" ADD COLUMN "allergen_confirmed" BOOLEAN NOT NULL DEFAULT false;
