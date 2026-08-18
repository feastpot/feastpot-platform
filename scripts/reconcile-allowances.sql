-- Founding-allowance reconciliation query (D-002 backstop).
--
-- Recomputes, per vendor, what foundingAllowanceUsedPence SHOULD be based on
-- the order and audit-log history, then reports any vendor where the stored
-- counter differs from the expected value.
--
-- Logic:
--   expected = SUM(o.founding_allowance_applied_pence) for all seeded orders
--              MINUS SUM(allowanceRestoredPence) recorded in refund_issued audit logs
--
-- This is a READ-ONLY diagnostic query. It never writes. Run with:
--   psql "$SUPABASE_DIRECT_URL" -f scripts/reconcile-allowances.sql
--
-- On a clean seeded world with no refunded allowance-consuming orders this
-- should return zero rows. That zero is itself proof the query works.

WITH applied AS (
  SELECT
    v.id                                          AS vendor_id,
    v.business_name,
    v.founding_allowance_granted_pence            AS granted_pence,
    v.founding_allowance_used_pence               AS stored_used_pence,
    COALESCE(SUM(o.founding_allowance_applied_pence), 0)::BIGINT AS total_applied_pence
  FROM vendors v
  LEFT JOIN orders o ON o.vendor_id = v.id
  GROUP BY v.id, v.business_name, v.founding_allowance_granted_pence, v.founding_allowance_used_pence
),
restored AS (
  -- Sum allowanceRestoredPence from all refund_issued audit-log rows per vendor.
  SELECT
    o.vendor_id,
    COALESCE(SUM((al.metadata->>'allowanceRestoredPence')::BIGINT), 0) AS total_restored_pence
  FROM audit_logs al
  JOIN orders o ON o.id = al.entity_id
  WHERE al.action = 'refund_issued'
    AND al.entity_type = 'orders'
    AND al.metadata ? 'allowanceRestoredPence'
    AND (al.metadata->>'allowanceRestoredPence')::BIGINT > 0
  GROUP BY o.vendor_id
),
expected AS (
  SELECT
    a.vendor_id,
    a.business_name,
    a.granted_pence,
    a.stored_used_pence,
    a.total_applied_pence,
    COALESCE(r.total_restored_pence, 0)           AS total_restored_pence,
    a.total_applied_pence - COALESCE(r.total_restored_pence, 0) AS expected_used_pence
  FROM applied a
  LEFT JOIN restored r USING (vendor_id)
)
SELECT
  vendor_id,
  business_name,
  granted_pence,
  stored_used_pence,
  expected_used_pence,
  stored_used_pence - expected_used_pence AS discrepancy_pence
FROM expected
WHERE stored_used_pence <> expected_used_pence
  AND (total_applied_pence > 0 OR stored_used_pence > 0)
ORDER BY ABS(stored_used_pence - expected_used_pence) DESC;

-- Zero rows = no discrepancies found.
-- Non-zero rows = vendors whose counter is off; investigate audit_logs for each.
