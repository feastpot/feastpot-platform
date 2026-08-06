-- Migration: source-based commission rate engine
-- Replaces hardcoded 12% (commissionBps on Vendor) with a DB-driven rate
-- table. Rates are immutable once active; changes create a new row.

CREATE TABLE "commission_rates" (
  "id"             TEXT            NOT NULL,
  "source"         "OrderSource"   NOT NULL,
  "is_first_order" BOOLEAN,
  "rate_percent"   DECIMAL(5,2)    NOT NULL,
  "effective_from" TIMESTAMPTZ     NOT NULL,
  "effective_to"   TIMESTAMPTZ,
  "created_by"     TEXT            NOT NULL,
  "note"           TEXT,
  CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "commission_rates_source_effectivefrom_idx"
  ON "commission_rates"("source", "effective_from");

CREATE TABLE "order_commissions" (
  "id"                  TEXT         NOT NULL,
  "order_id"            UUID         NOT NULL,
  "food_subtotal_pence" INTEGER      NOT NULL,
  "rate_percent"        DECIMAL(5,2) NOT NULL,
  "commission_pence"    INTEGER      NOT NULL,
  "commission_rate_id"  TEXT         NOT NULL,
  "source"              "OrderSource" NOT NULL,
  "is_first_order"      BOOLEAN      NOT NULL,
  "calculated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "order_commissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_commissions_order_id_key" ON "order_commissions"("order_id");
ALTER TABLE "order_commissions"
  ADD CONSTRAINT "order_commissions_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_commissions"
  ADD CONSTRAINT "order_commissions_commission_rate_id_fkey"
  FOREIGN KEY ("commission_rate_id") REFERENCES "commission_rates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed initial rates, effective from platform launch (covers all historic orders).
-- MARKETPLACE first order  = 12 %
-- MARKETPLACE repeat order = 10 %
-- VENDOR_REFERRED (all)    =  0 %  (configurable 0-3 %; launch at 0 %)
INSERT INTO "commission_rates"
  ("id", "source", "is_first_order", "rate_percent", "effective_from", "created_by", "note")
VALUES
  ('cmrate_mkt_first_v1',  'MARKETPLACE',    true,  12.00, '2020-01-01 00:00:00+00', 'system', 'Marketplace - first order with vendor'),
  ('cmrate_mkt_repeat_v1', 'MARKETPLACE',    false, 10.00, '2020-01-01 00:00:00+00', 'system', 'Marketplace - repeat order with vendor'),
  ('cmrate_referred_v1',   'VENDOR_REFERRED', NULL,   0.00, '2020-01-01 00:00:00+00', 'system', 'Vendor-referred - 0% launch rate (configurable 0-3%)');
