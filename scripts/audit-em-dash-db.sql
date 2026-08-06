-- audit-em-dash-db.sql
-- Run against either the dev or production Supabase database to report any
-- stored em dashes (U+2014) in user-generated or CMS-driven content.
--
-- Usage (dev):
--   psql "$SUPABASE_DIRECT_URL" -f scripts/audit-em-dash-db.sql
--
-- Usage (production):
--   psql "$PROD_DIRECT_URL"    -f scripts/audit-em-dash-db.sql
--
-- Interpretation:
--   Zero rows = nothing to fix.
--   Any rows   = review each excerpt manually before deciding on a replacement.
--   Do NOT run UPDATE on user-generated vendor content without flagging it in
--   the admin panel first (see CONTRIBUTING.md).
--
-- Last run against dev: 2026-08-06 - returned zero rows.

SELECT
  'vendors'    AS "table",
  id::text     AS "id",
  'description' AS "column",
  LEFT(description, 200) AS "excerpt"
FROM vendors
WHERE description LIKE E'%\u2014%'

UNION ALL

SELECT 'vendors', id::text, 'business_name', LEFT(business_name, 200)
FROM vendors
WHERE business_name LIKE E'%\u2014%'

UNION ALL

SELECT 'menu_items', id::text, 'name', LEFT(name, 200)
FROM menu_items
WHERE name LIKE E'%\u2014%'

UNION ALL

SELECT 'menu_items', id::text, 'description', LEFT(description, 200)
FROM menu_items
WHERE description LIKE E'%\u2014%'

UNION ALL

SELECT 'menus', id::text, 'name', LEFT(name, 200)
FROM menus
WHERE name LIKE E'%\u2014%'

UNION ALL

SELECT 'catering_enquiries', id::text, 'occasion_type', LEFT(occasion_type, 200)
FROM catering_enquiries
WHERE occasion_type LIKE E'%\u2014%'

ORDER BY "table", "id";
