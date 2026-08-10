-- Migration: purge seed data and reviews not backed by a genuine completed order
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  OPERATOR — READ BEFORE RUNNING                                         ║
-- ║                                                                          ║
-- ║  1. Take a full database backup NOW. This migration is irreversible;     ║
-- ║     recovery is via the pre-migration backup only. No down migration     ║
-- ║     exists.                                                              ║
-- ║                                                                          ║
-- ║  2. Before running db:deploy, ensure the seed script has set             ║
-- ║     is_seed_data = true on every Vendor and Order row it created.        ║
-- ║     A human review of `SELECT count(*) FROM vendors WHERE is_seed_data`  ║
-- ║     and `SELECT count(*) FROM orders WHERE is_seed_data` is recommended  ║
-- ║     before proceeding.                                                   ║
-- ║                                                                          ║
-- ║  3. The migration wraps all deletions in a single transaction. If any    ║
-- ║     step fails (e.g. an unexpected FK violation) the entire transaction  ║
-- ║     rolls back and no rows are deleted. Fix the blocking data, then      ║
-- ║     re-run.                                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- LEGAL BASIS: UK DMCC Act 2024 s.234 and Sch.18 para.11 prohibit presenting
-- consumer reviews that are not based on genuine experience. A review is
-- genuine only when it is tied to an Order that reached `delivered` status
-- and was not a seed/test row. All other reviews are deleted here.
--
-- DELETION ORDER (respects FK constraints):
--   1.  Reviews failing the DMCC genuine-experience check
--   2a. order_attributions   (RESTRICT from orders — no cascade)
--   2b. order_commissions    (RESTRICT from orders — no cascade)
--   2c. payouts.order_id     (nullable FK, no cascade — NULL out, keep row)
--   2d. menu_items / menus   (explicit per task spec; also cascade from vendor)
--   2e. Orders with is_seed_data = true
--       (cascade removes: payments, disputes, dispute_evidence, dispute_appeals,
--        order_items, order_amendments, order_admin_tags, feast_pass_savings,
--        reviews linked to those orders; chargebacks.order_id → SetNull)
--   3a. terms_acceptances    (RESTRICT from vendors — no cascade)
--   3b. referral_clicks      (RESTRICT from vendor_referral_links)
--   3c. vendor_referral_links (RESTRICT from vendors — no cascade)
--   3d. Vendors with is_seed_data = true
--       (cascade removes: menus, menu_items, delivery_configs, vendor_documents,
--        blackout_dates, vendor_trust_signals, vendor_capacity, vendor_members,
--        payouts, reviews, event_quotes, vendor_verifications,
--        vendor_enforcement_actions, vendor_tax_profiles)
--   4.  Verification block — raises an exception (rolls back) if any seed rows
--       or invalid reviews remain.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Delete Reviews that fail the DMCC Act 2024 genuine-experience check.
--
-- A review is KEPT only when ALL of the following hold:
--   • is_verified = true
--   • moderation_status IN ('auto_approved', 'approved')
--   • the linked Order has status = 'delivered'
--     ('delivered' is the only terminal status representing genuine receipt;
--     'cancelled', 'rejected', 'refunded', 'dispatched' etc. do not qualify)
--   • the linked Order has is_seed_data = false
--
-- Edge case: a Review whose Order was refunded or cancelled after delivery
-- has status <> 'delivered', so it is deleted. A Review whose Order is
-- is_seed_data = true is deleted even if status = 'delivered'.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM reviews
WHERE
    is_verified = false
    OR moderation_status NOT IN ('auto_approved', 'approved')
    OR order_id NOT IN (
        SELECT id FROM orders
        WHERE status = 'delivered'
          AND is_seed_data = false
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2a: Clear order_attributions for seed Orders.
-- order_attributions has no ON DELETE CASCADE from orders (RESTRICT).
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM order_attributions
WHERE order_id IN (SELECT id FROM orders WHERE is_seed_data = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2b: Clear order_commissions for seed Orders.
-- order_commissions has no ON DELETE CASCADE from orders (RESTRICT).
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM order_commissions
WHERE order_id IN (SELECT id FROM orders WHERE is_seed_data = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2c: NULL out payouts.order_id for seed Orders.
-- payouts.order_id is nullable with no ON DELETE action (RESTRICT).
-- We NULL it out rather than deleting the payout row because weekly batch
-- payouts aggregate multiple orders; the payout itself is cleaned up via
-- the vendor cascade in step 3d.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE payouts
SET order_id = NULL
WHERE order_id IN (SELECT id FROM orders WHERE is_seed_data = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2d: Explicit MenuItem and Menu deletion for seed Vendors (task spec §2b).
-- These also cascade from the Vendor deletion in step 3d, but we delete them
-- here explicitly as required so the operator can verify row counts before the
-- vendor rows are removed.
-- Vendors with no menus are handled correctly (zero rows affected is not an error).
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM menu_items
WHERE vendor_id IN (SELECT id FROM vendors WHERE is_seed_data = true);

DELETE FROM menus
WHERE vendor_id IN (SELECT id FROM vendors WHERE is_seed_data = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2e: Delete seed Orders.
-- ON DELETE CASCADE automatically removes: payments, disputes, dispute_evidence,
-- dispute_appeals, order_items, order_amendments, order_admin_tags,
-- feast_pass_savings, and any remaining reviews linked to these orders.
-- chargebacks.order_id is SET NULL automatically (no rows deleted).
-- Reviews linked to seed orders were already removed in step 1.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM orders WHERE is_seed_data = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3a: Clear terms_acceptances for seed Vendors.
-- terms_acceptances has no ON DELETE CASCADE from vendors (RESTRICT).
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM terms_acceptances
WHERE vendor_id IN (SELECT id FROM vendors WHERE is_seed_data = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3b: Clear referral_clicks for seed Vendors' referral links.
-- referral_clicks has a FK to vendor_referral_links (RESTRICT), and
-- vendor_referral_links has a FK to vendors (RESTRICT, no cascade).
-- Clicks must be removed before links.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM referral_clicks
WHERE referral_link_id IN (
    SELECT id FROM vendor_referral_links
    WHERE vendor_id IN (SELECT id FROM vendors WHERE is_seed_data = true)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3c: Clear vendor_referral_links for seed Vendors.
-- vendor_referral_links has no ON DELETE CASCADE from vendors (RESTRICT).
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM vendor_referral_links
WHERE vendor_id IN (SELECT id FROM vendors WHERE is_seed_data = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3d: Delete seed Vendors.
-- ON DELETE CASCADE automatically removes all remaining dependants:
--   menus, menu_items (already gone from step 2d — cascade is a no-op),
--   delivery_configs, vendor_documents, blackout_dates,
--   vendor_trust_signals, vendor_capacity, vendor_members,
--   payouts (order_id already NULLed in step 2c),
--   reviews, event_quotes, vendor_verifications,
--   vendor_enforcement_actions, vendor_tax_profiles.
--
-- ASSUMPTION: seed Vendors have only seed Orders (is_seed_data = true).
-- If a seed Vendor somehow has a non-seed Order still referencing it, the
-- FK on orders.vendor_id (no cascade) will raise a constraint violation,
-- the transaction will roll back, and no data will be deleted. Resolve by
-- inspecting: SELECT o.id, o.order_number FROM orders o
--             JOIN vendors v ON v.id = o.vendor_id
--             WHERE v.is_seed_data = true AND o.is_seed_data = false;
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM vendors WHERE is_seed_data = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Verification — fail the transaction if any seed rows or invalid
-- reviews remain. All counts must be 0 or the migration is rolled back.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_seed_vendors      INTEGER;
    v_seed_orders       INTEGER;
    v_invalid_reviews   INTEGER;
    v_orphan_menu_items INTEGER;
    v_orphan_menus      INTEGER;
BEGIN
    -- Seed rows remaining
    SELECT COUNT(*) INTO v_seed_vendors FROM vendors WHERE is_seed_data = true;
    SELECT COUNT(*) INTO v_seed_orders  FROM orders  WHERE is_seed_data = true;

    -- Reviews not backed by a genuine delivered, non-seed order
    SELECT COUNT(*) INTO v_invalid_reviews
    FROM reviews r
    WHERE
        r.is_verified = false
        OR r.moderation_status NOT IN ('auto_approved', 'approved')
        OR r.order_id NOT IN (
            SELECT id FROM orders
            WHERE status = 'delivered'
              AND is_seed_data = false
        );

    -- Orphaned MenuItem rows (vendor deleted but items remain)
    -- Diagnostic query (for manual inspection if needed):
    --   SELECT mi.id, mi.name FROM menu_items mi
    --   LEFT JOIN vendors v ON v.id = mi.vendor_id WHERE v.id IS NULL;
    SELECT COUNT(*) INTO v_orphan_menu_items
    FROM menu_items mi
    WHERE NOT EXISTS (SELECT 1 FROM vendors v WHERE v.id = mi.vendor_id);

    -- Orphaned Menu rows (vendor deleted but menus remain)
    -- Diagnostic query:
    --   SELECT m.id, m.name FROM menus m
    --   LEFT JOIN vendors v ON v.id = m.vendor_id WHERE v.id IS NULL;
    SELECT COUNT(*) INTO v_orphan_menus
    FROM menus m
    WHERE NOT EXISTS (SELECT 1 FROM vendors v WHERE v.id = m.vendor_id);

    IF v_seed_vendors > 0 THEN
        RAISE EXCEPTION
            'VERIFICATION FAILED: % seed Vendor row(s) still present after purge.',
            v_seed_vendors;
    END IF;

    IF v_seed_orders > 0 THEN
        RAISE EXCEPTION
            'VERIFICATION FAILED: % seed Order row(s) still present after purge.',
            v_seed_orders;
    END IF;

    IF v_invalid_reviews > 0 THEN
        RAISE EXCEPTION
            'VERIFICATION FAILED: % Review row(s) not backed by a genuine '
            'delivered, non-seed Order remain (DMCC Act 2024 compliance breach).',
            v_invalid_reviews;
    END IF;

    IF v_orphan_menu_items > 0 THEN
        RAISE EXCEPTION
            'VERIFICATION FAILED: % orphaned MenuItem row(s) found (vendor '
            'no longer exists).',
            v_orphan_menu_items;
    END IF;

    IF v_orphan_menus > 0 THEN
        RAISE EXCEPTION
            'VERIFICATION FAILED: % orphaned Menu row(s) found (vendor '
            'no longer exists).',
            v_orphan_menus;
    END IF;

    RAISE NOTICE 'Purge verification passed: 0 seed vendors, 0 seed orders, '
                 '0 invalid reviews, 0 orphaned menu rows.';
END
$$;

COMMIT;
