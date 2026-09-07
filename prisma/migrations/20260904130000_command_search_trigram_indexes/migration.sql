-- Keep command-palette prefix searches bounded as the operational tables grow.
-- Prisma emits case-insensitive ILIKE predicates for these `startsWith` filters;
-- pg_trgm GIN indexes support those predicates without changing application SQL.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "orders_order_number_trgm_idx"
  ON "orders" USING GIN ("order_number" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "vendors_business_name_trgm_idx"
  ON "vendors" USING GIN ("business_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "users_email_trgm_idx"
  ON "users" USING GIN ("email" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "catering_enquiries_contact_name_trgm_idx"
  ON "catering_enquiries" USING GIN ("contact_name" gin_trgm_ops);