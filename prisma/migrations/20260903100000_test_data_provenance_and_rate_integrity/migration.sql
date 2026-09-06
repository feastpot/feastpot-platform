-- Explicit test-data provenance and commission-rate integrity.
-- This migration is deliberately conservative: no user/contact identity is inferred.

ALTER TABLE users ADD COLUMN is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN provenance VARCHAR(64);
ALTER TABLE audit_logs ADD COLUMN is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN provenance VARCHAR(64);
ALTER TABLE catering_enquiries ADD COLUMN is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE catering_enquiries ADD COLUMN provenance VARCHAR(64);

CREATE INDEX users_is_test_data_idx ON users(is_test_data);
CREATE INDEX audit_logs_is_test_data_idx ON audit_logs(is_test_data);
CREATE INDEX catering_enquiries_is_test_data_idx ON catering_enquiries(is_test_data);

-- Classify historic seed users only through pre-existing, durable seed flags.
-- Do not derive provenance from an email, name, role, or vendor ownership.
-- A user attached to a seed order or an explicitly seed-marked vendor is part
-- of the fixture graph; the relationship and the marker existed before this
-- migration and make this backfill deterministic.
UPDATE users u
SET is_test_data = true, provenance = 'seed'
WHERE EXISTS (
  SELECT 1
  FROM orders o
  WHERE o.is_seed_data = true
    AND (
      o.customer_id = u.id
      OR EXISTS (
        SELECT 1 FROM vendors v
        WHERE v.id = o.vendor_id
          AND v.user_id = u.id
      )
    )
)
OR EXISTS (
  SELECT 1
  FROM vendors v
  WHERE v.user_id = u.id
    AND v.is_seed_data = true
);

-- dp_test_ is an explicit integration-test run marker, not an identity heuristic.
UPDATE audit_logs
SET is_test_data = true, provenance = 'dp_test'
WHERE metadata::text LIKE '%dp_test\_%' ESCAPE '\';

-- Preserve audit history while labelling rows whose actor already has an
-- explicit durable fixture marker. No audit rows are deleted.
UPDATE audit_logs al
SET is_test_data = true, provenance = u.provenance
FROM users u
WHERE al.actor_id = u.id
  AND u.is_test_data = true
  AND al.is_test_data = false;

-- Only rows explicitly written by a fixture source are classified.
UPDATE catering_enquiries
SET is_test_data = true, provenance = source
WHERE source IN ('seed', 'test-factory');

ALTER TABLE commission_rates ADD COLUMN is_anomalous BOOLEAN NOT NULL DEFAULT false;
UPDATE commission_rates
SET is_anomalous = true
WHERE effective_to IS NOT NULL AND effective_to <= effective_from;

-- Delete only exact zero-duration rows that have no immutable financial reference.
DELETE FROM commission_rates cr
WHERE cr.effective_to = cr.effective_from
  AND NOT EXISTS (
    SELECT 1 FROM order_commissions oc WHERE oc.commission_rate_id = cr.id
  );

-- New writes cannot create empty/reversed effective windows. NOT VALID preserves
-- referenced historical anomalies above while enforcing the rule for every new row.
ALTER TABLE commission_rates
  ADD CONSTRAINT commission_rates_positive_window
  CHECK (effective_to IS NULL OR effective_to > effective_from) NOT VALID;

-- Valid history may never have two starts in the same logical slot. The partial
-- index deliberately leaves labelled legacy anomalies intact for audit provenance.
CREATE UNIQUE INDEX commission_rates_valid_slot_start_key
  ON commission_rates (source, COALESCE(is_first_order, false), (is_first_order IS NULL), effective_from)
  WHERE is_anomalous = false;