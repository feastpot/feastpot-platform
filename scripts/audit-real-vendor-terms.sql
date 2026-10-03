-- Read-only. Run against a verified target with default_transaction_read_only=on.
-- Never classify test data by email address or business name.
WITH current_terms AS (
  SELECT id, version
  FROM public.terms_versions
  WHERE document_type = 'VENDOR_TERMS' AND effective_at <= CURRENT_TIMESTAMP
  ORDER BY effective_at DESC, published_at DESC, id DESC
  LIMIT 1
), real_vendors AS (
  SELECT v.id, v.status,
    EXISTS (
      SELECT 1 FROM public.terms_acceptances a
      WHERE a.vendor_id = v.id AND a.terms_version_id = (SELECT id FROM current_terms)
    ) AS accepted
  FROM public.vendors v
  JOIN public.users owner ON owner.id = v.user_id
  WHERE NOT v.is_seed_data AND NOT owner.is_test_data AND NOT v.public_demo
)
SELECT
  (SELECT version FROM current_terms) AS current_version,
  COUNT(*) AS all_real_vendors,
  COUNT(*) FILTER (WHERE accepted) AS all_real_accepted,
  COUNT(*) FILTER (WHERE status IN ('live', 'probation')) AS real_trading_vendors,
  COUNT(*) FILTER (WHERE status IN ('live', 'probation') AND accepted) AS real_trading_accepted,
  COUNT(*) FILTER (WHERE status IN ('live', 'probation') AND NOT accepted) AS real_trading_gap
FROM real_vendors;