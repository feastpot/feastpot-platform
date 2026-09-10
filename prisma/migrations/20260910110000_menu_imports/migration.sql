CREATE TYPE "MenuImportStatus" AS ENUM ('processing', 'extracted', 'failed', 'applied');
CREATE TYPE "MenuImportItemStatus" AS ENUM ('candidate', 'accepted', 'rejected', 'applied');

CREATE TABLE "menu_imports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "status" "MenuImportStatus" NOT NULL DEFAULT 'processing',
  "source_files" JSONB NOT NULL,
  "error_code" VARCHAR(80),
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "menu_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menu_imports_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "menu_imports_vendor_id_created_at_idx" ON "menu_imports" ("vendor_id", "created_at" DESC);
CREATE INDEX "menu_imports_vendor_id_status_idx" ON "menu_imports" ("vendor_id", "status");

CREATE TABLE "menu_import_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "import_id" UUID NOT NULL,
  "menu_item_id" UUID UNIQUE,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "price_pence" INTEGER,
  "portion_label" VARCHAR(64),
  "review_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allergens" VARCHAR(64)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(64)[],
  "allergens_free_from" BOOLEAN NOT NULL DEFAULT FALSE,
  "allergen_confirmed_at" TIMESTAMPTZ,
  "status" "MenuImportItemStatus" NOT NULL DEFAULT 'candidate',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "menu_import_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menu_import_items_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "menu_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "menu_import_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "menu_import_items_import_id_status_idx" ON "menu_import_items" ("import_id", "status");

-- Import originals and candidates are private vendor workflow data.  The API
-- uses the service role and performs ownership checks; direct anon/auth access
-- must remain denied.
ALTER TABLE "menu_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_imports" FORCE ROW LEVEL SECURITY;
ALTER TABLE "menu_import_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_import_items" FORCE ROW LEVEL SECURITY;