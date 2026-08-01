-- Backfill: one vendor_trust_signals row per signal_type for every existing
-- vendor, at status 'not_provided'. Idempotent via ON CONFLICT DO NOTHING on
-- the (vendor_id, signal_type) unique key, so re-running is a no-op.
INSERT INTO "vendor_trust_signals" ("vendor_id", "signal_type")
SELECT v."id", t."signal_type"
FROM "vendors" v
CROSS JOIN unnest(enum_range(NULL::"vendor_trust_signal_type")) AS t("signal_type")
ON CONFLICT ("vendor_id", "signal_type") DO NOTHING;
