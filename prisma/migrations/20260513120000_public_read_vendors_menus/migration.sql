-- Allow safe public read access for browsing vendors and their menus.
--
-- Context: migration 20260513000000_enable_rls_all_tables locked every table
-- down with FORCE RLS and no policies, so the Supabase `anon` /
-- `authenticated` roles cannot read anything via PostgREST. All API traffic
-- still goes through the privileged server role and is unaffected.
--
-- This migration adds narrowly-scoped SELECT policies on the three
-- public-facing catalogue tables so that the frontends can (now or in the
-- future) read directly from Supabase without exposing PII or
-- unapproved/inactive content. No INSERT/UPDATE/DELETE policies are added -
-- writes continue to flow exclusively through the API.
--
-- Visibility rules:
--   * vendors:    only rows whose status is `approved` or `live`.
--   * menus:      only `is_active = true` rows belonging to a visible vendor.
--   * menu_items: only `is_available = true` rows whose moderation_status is
--                 `auto_approved` or `approved`, belonging to a visible
--                 vendor and a visible (active) menu.

-- ---------------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "vendors_public_read" ON "public"."vendors";
CREATE POLICY "vendors_public_read"
  ON "public"."vendors"
  FOR SELECT
  TO anon, authenticated
  USING (status IN ('approved', 'live'));

-- ---------------------------------------------------------------------------
-- menus
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "menus_public_read" ON "public"."menus";
CREATE POLICY "menus_public_read"
  ON "public"."menus"
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM "public"."vendors" v
      WHERE v.id = "menus".vendor_id
        AND v.status IN ('approved', 'live')
    )
  );

-- ---------------------------------------------------------------------------
-- menu_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "menu_items_public_read" ON "public"."menu_items";
CREATE POLICY "menu_items_public_read"
  ON "public"."menu_items"
  FOR SELECT
  TO anon, authenticated
  USING (
    is_available = true
    AND moderation_status IN ('auto_approved', 'approved')
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
