-- Immediate marketplace commission cutover.
-- transaction_timestamp() deliberately captures the migration-application time:
-- historic orders continue to resolve against the rows closed below.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  cutover_at timestamptz := transaction_timestamp();
  next_first_start timestamptz;
  next_repeat_start timestamptz;
BEGIN
  -- Fixed IDs make this data change safe if a migration runner retries it.
  -- Each slot is guarded independently so a partially applied transaction can
  -- also be safely repaired without touching its already inserted counterpart.
  IF NOT EXISTS (
    SELECT 1 FROM "commission_rates" WHERE "id" = 'cmrate_mkt_first_immediate_8pct'
  ) THEN
    -- Future rows were already announced/scheduled. The immediate rows fill
    -- only the interval until the first such row, without overwriting it.
    SELECT MIN("effective_from")
      INTO next_first_start
      FROM "commission_rates"
     WHERE "source" = 'MARKETPLACE'::"OrderSource"
       AND "is_first_order" = true
       AND "effective_from" > cutover_at;

    -- Only rows actually effective at cutover are closed. Rows that have
    -- already ended and scheduled future rows remain immutable.
    UPDATE "commission_rates"
       SET "effective_to" = cutover_at
     WHERE "source" = 'MARKETPLACE'::"OrderSource"
       AND "is_first_order" = true
       AND "effective_from" < cutover_at
       AND ("effective_to" IS NULL OR "effective_to" > cutover_at);

    INSERT INTO "commission_rates"
      ("id", "source", "is_first_order", "rate_percent", "effective_from",
       "effective_to", "created_by", "note", "rate_key")
    VALUES ('cmrate_mkt_first_immediate_8pct', 'MARKETPLACE'::"OrderSource", true,
            8.00, cutover_at, next_first_start, 'system',
            'Immediate marketplace first-order commission cutover', 'standard_commission');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "commission_rates" WHERE "id" = 'cmrate_mkt_repeat_immediate_5pct'
  ) THEN
    SELECT MIN("effective_from")
      INTO next_repeat_start
      FROM "commission_rates"
     WHERE "source" = 'MARKETPLACE'::"OrderSource"
       AND "is_first_order" = false
       AND "effective_from" > cutover_at;

    UPDATE "commission_rates"
       SET "effective_to" = cutover_at
     WHERE "source" = 'MARKETPLACE'::"OrderSource"
       AND "is_first_order" = false
       AND "effective_from" < cutover_at
       AND ("effective_to" IS NULL OR "effective_to" > cutover_at);

    INSERT INTO "commission_rates"
      ("id", "source", "is_first_order", "rate_percent", "effective_from",
       "effective_to", "created_by", "note", "rate_key")
    VALUES ('cmrate_mkt_repeat_immediate_5pct', 'MARKETPLACE'::"OrderSource", false,
            5.00, cutover_at, next_repeat_start, 'system',
            'Immediate marketplace repeat-order commission cutover', 'repeat_commission');
  END IF;
END $$;

-- Keep the legacy Vendor default aligned for read-only admin displays and seed
-- compatibility. Order calculation itself always resolves commission_rates.
ALTER TABLE "vendors" ALTER COLUMN "commission_bps" SET DEFAULT 800;

-- Publish an immutable v2.1 Rate Schedule at the same cutover instant. This is
-- the public/legal display source; it is deliberately separate from the
-- VENDOR_TERMS document, whose substantive clause rewrite requires solicitor
-- sign-off through the existing publishing service.
DO $$
DECLARE
  cutover_at timestamptz := transaction_timestamp();
  schedule_id text := 'terms_rate_schedule_v2_1';
  schedule_content text :=
    '# Rate Schedule (Annex A): Feastpot Vendor Terms v2.1' || E'\n\n' ||
    'Marketplace rates apply to Food Subtotal only. Catering commission applies to the Event total.' || E'\n\n' ||
    '| Segment | Rate | Basis |' || E'\n' ||
    '|---|---:|---|' || E'\n' ||
    '| First-order marketplace commission | 8% | Food Subtotal |' || E'\n' ||
    '| Repeat-order commission | 5% | Food Subtotal |' || E'\n' ||
    '| Vendor-referred commission | 0% | Food Subtotal |' || E'\n' ||
    '| Catering commission | 10% | Event total |' || E'\n' ||
    '| Customer service fee | 5%, capped at GBP 2.99 | Charged to the Customer, not the vendor |';
BEGIN
  INSERT INTO "terms_versions"
    ("id", "document_type", "version", "content_mdx", "content_hash",
     "change_summary", "is_material", "published_at", "effective_at", "created_by")
  VALUES
    (schedule_id, 'RATE_SCHEDULE'::"TermsDocumentType", '2.1', schedule_content,
     encode(digest(schedule_content, 'sha256'), 'hex'),
     'Rates went down immediately: first-order marketplace commission from 12% to 8% and repeat-order commission from 10% to 5%. Vendor-referred remains 0%; catering remains 10%. Customer service fee remains separate at 5%, capped at GBP 2.99.',
     true, cutover_at, cutover_at, 'system')
  ON CONFLICT ("document_type", "version") DO NOTHING;

  SELECT "id" INTO schedule_id
    FROM "terms_versions"
   WHERE "document_type" = 'RATE_SCHEDULE'::"TermsDocumentType"
     AND "version" = '2.1';

  UPDATE "terms_versions"
     SET "superseded_at" = cutover_at
   WHERE "document_type" = 'RATE_SCHEDULE'::"TermsDocumentType"
     AND "id" <> schedule_id
     AND "effective_at" <= cutover_at
     AND "superseded_at" IS NULL;

  INSERT INTO "rate_schedule_entries"
    ("id", "version_id", "key", "label", "rate_display", "rate_value",
     "basis", "vat_note", "status", "sort_order")
  VALUES
    ('rate_schedule_v2_1_first', schedule_id, 'standard_commission',
     'First-order marketplace commission', '8%', 8.00, 'Food Subtotal',
     'Commission is inclusive of VAT where Feastpot is registered.', 'LIVE', 1),
    ('rate_schedule_v2_1_repeat', schedule_id, 'repeat_commission',
     'Repeat-order commission', '5%', 5.00, 'Food Subtotal',
     'Commission is inclusive of VAT where Feastpot is registered.', 'LIVE', 2),
    ('rate_schedule_v2_1_referred', schedule_id, 'referred_commission',
     'Vendor-referred commission', '0%', 0.00, 'Food Subtotal',
     'No commission is charged on vendor-referred orders.', 'LIVE', 3),
    ('rate_schedule_v2_1_catering', schedule_id, 'catering_commission',
     'Catering commission', '10%', 10.00, 'Event total',
     'Commission is inclusive of VAT where Feastpot is registered.', 'LIVE', 4),
    ('rate_schedule_v2_1_deposit', schedule_id, 'catering_deposit',
     'Catering booking deposit', '25% minimum', 25.00, 'Part-payment of the Event total',
     'The deposit is not an additional fee.', 'LIVE', 5),
    ('rate_schedule_v2_1_founding', schedule_id, 'founding_cook',
     'Founding cook programme', '0%', 0.00, 'Food Subtotal; time-limited',
     'Standard rates apply after the promotional period.', 'INCENTIVE', 6),
    ('rate_schedule_v2_1_service_fee', schedule_id, 'customer_service_fee',
     'Customer service fee', '5% (max GBP 2.99)', 5.00,
     'Charged to the Customer and retained by Feastpot; never deducted from vendor payout',
     'FeastPass members are exempt.', 'CUSTOMER_SIDE', 7),
    ('rate_schedule_v2_1_vendor_pro', schedule_id, 'vendor_pro',
     'Vendor Pro subscription', 'approx GBP 19/month', NULL, 'Optional monthly subscription',
     'VAT applies at the prevailing rate.', 'OPTIONAL_ADDON', 8)
  ON CONFLICT ("version_id", "key") DO NOTHING;
END $$;

-- Guard the half-open effective interval invariant at the database boundary.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commission_rates_effective_to_after_from_check'
      AND conrelid = 'public.commission_rates'::regclass
  ) THEN
    ALTER TABLE "commission_rates"
      ADD CONSTRAINT "commission_rates_effective_to_after_from_check"
      CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");
  END IF;
END $$;