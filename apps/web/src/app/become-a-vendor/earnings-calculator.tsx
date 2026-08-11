'use client';

import { useMemo, useState } from 'react';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

// ── Maths helpers ─────────────────────────────────────────────────────────

/**
 * Round half up to the nearest integer (pence).
 * Standard "schoolbook" rounding: .5 rounds away from zero.
 */
function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

/**
 * Format an integer pence value as GBP with thousands separators and
 * exactly two decimal places.  All arithmetic is done in integer pence
 * so there are no floating-point artefacts to hide.
 */
function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pence / 100);
}

/**
 * Estimate Stripe processing cost for a given revenue block.
 *
 * 1.5% of revenue (rounded half-up to the nearest penny) + 20p per
 * transaction.  This is an EXTERNAL ESTIMATE using publicly listed UK
 * Stripe rates; Feastpot does not set or mark up Stripe fees.
 */
function stripeEstimatePence(revenuePence: number, txCount: number): number {
  return roundHalfUp(revenuePence * 0.015) + txCount * 20;
}

// ── Rate constants from PLATFORM_FACTS ───────────────────────────────────
//
// Read once so they cannot drift from the central source.  Changing the
// value in platform-facts.ts changes every output cell with no other edit.

const MARKETPLACE_FIRST_RATE = PLATFORM_FACTS.commission.marketplaceFirst / 100;
const MARKETPLACE_REPEAT_RATE = PLATFORM_FACTS.commission.marketplaceRepeat / 100;
// Commission on vendor-referred orders is 0% - kept as a variable so
// the calculation path is explicit even when multiplied by zero.
const VENDOR_REFERRED_RATE = PLATFORM_FACTS.commission.vendorReferred / 100;

// ── Model types ───────────────────────────────────────────────────────────

interface ModelResult {
  totalRevenuePence: number;
  platformCostPence: number;
  stripeCostPence: number;
  totalCostPence: number;
  netPence: number;
}

interface AllModels {
  feastpot: ModelResult;
  flat: ModelResult;
  aggregator: ModelResult;
}

// ── Core calculation ──────────────────────────────────────────────────────

function computeModels(
  ownRevenuePence: number,
  avgOrderValuePence: number,
  feastpotFirstCount: number,
  feastpotRepeatCount: number,
  aggregatorRatePct: number,
): AllModels {
  // Derive Feastpot-order revenue from counts × average order value.
  const feastpotFirstRevenue = feastpotFirstCount * avgOrderValuePence;
  const feastpotRepeatRevenue = feastpotRepeatCount * avgOrderValuePence;
  const totalRevenuePence = ownRevenuePence + feastpotFirstRevenue + feastpotRepeatRevenue;

  // Transaction counts (guard against avgOrderValue = 0).
  const ownTxCount =
    avgOrderValuePence > 0 ? Math.round(ownRevenuePence / avgOrderValuePence) : 0;
  const totalTxCount = ownTxCount + feastpotFirstCount + feastpotRepeatCount;

  // Stripe estimate is the same real cost in all three models.
  const stripeCost = stripeEstimatePence(totalRevenuePence, totalTxCount);

  // ── Model 1: Feastpot (real model) ─────────────────────────────────────
  // Own orders: 0% platform commission (VENDOR_REFERRED_RATE = 0).
  // Marketplace first: MARKETPLACE_FIRST_RATE.
  // Marketplace repeat: MARKETPLACE_REPEAT_RATE.
  const feastpotPlatformCost =
    roundHalfUp(ownRevenuePence * VENDOR_REFERRED_RATE) +
    roundHalfUp(feastpotFirstRevenue * MARKETPLACE_FIRST_RATE) +
    roundHalfUp(feastpotRepeatRevenue * MARKETPLACE_REPEAT_RATE);
  const feastpotTotalCost = feastpotPlatformCost + stripeCost;
  const feastpot: ModelResult = {
    totalRevenuePence,
    platformCostPence: feastpotPlatformCost,
    stripeCostPence: stripeCost,
    totalCostPence: feastpotTotalCost,
    netPence: totalRevenuePence - feastpotTotalCost,
  };

  // ── Model 2: Flat at first-order rate ──────────────────────────────────
  // Same MARKETPLACE_FIRST_RATE applied to all revenue (own + marketplace).
  const flatPlatformCost = roundHalfUp(totalRevenuePence * MARKETPLACE_FIRST_RATE);
  const flatTotalCost = flatPlatformCost + stripeCost;
  const flat: ModelResult = {
    totalRevenuePence,
    platformCostPence: flatPlatformCost,
    stripeCostPence: stripeCost,
    totalCostPence: flatTotalCost,
    netPence: totalRevenuePence - flatTotalCost,
  };

  // ── Model 3: Typical aggregator ────────────────────────────────────────
  // User-selectable rate (25-30%); treated as the platform's full cut
  // (some aggregators bundle processing; we show it separately for a like-
  // for-like comparison, consistent with models 1 and 2).
  const aggregatorPlatformCost = roundHalfUp(totalRevenuePence * (aggregatorRatePct / 100));
  const aggregatorTotalCost = aggregatorPlatformCost + stripeCost;
  const aggregator: ModelResult = {
    totalRevenuePence,
    platformCostPence: aggregatorPlatformCost,
    stripeCostPence: stripeCost,
    totalCostPence: aggregatorTotalCost,
    netPence: totalRevenuePence - aggregatorTotalCost,
  };

  return { feastpot, flat, aggregator };
}

// ── Sub-components ────────────────────────────────────────────────────────

interface ResultCardProps {
  label: string;
  rateLabel: string;
  result: ModelResult;
  highlight?: boolean;
}

function ResultCard({ label, rateLabel, result, highlight }: ResultCardProps) {
  return (
    <div
      className={
        'rounded-2xl p-5 ' +
        (highlight
          ? 'border-2 border-brand bg-white'
          : 'border border-cream-deep bg-white')
      }
    >
      <p
        className={
          'mb-0.5 text-[10px] font-black uppercase tracking-[0.14em] ' +
          (highlight ? 'text-brand' : 'text-charcoal-mid')
        }
      >
        {label}
      </p>
      <p className="mb-4 text-[13px] font-semibold text-charcoal">{rateLabel}</p>

      <div className="space-y-2">
        <Row label="Platform commission" value={result.platformCostPence} negative />
        <Row label="Stripe processing (est.)" value={result.stripeCostPence} negative faint />
        <div className="border-t border-cream-deep pt-2">
          <Row label="Total cost" value={result.totalCostPence} negative bold />
        </div>
        <div className="rounded-xl bg-brand-light px-3 py-2.5">
          <Row label="You keep" value={result.netPence} bold highlight={highlight} />
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  label: string;
  value: number;
  negative?: boolean;
  faint?: boolean;
  bold?: boolean;
  highlight?: boolean;
}

function Row({ label, value, negative, faint, bold, highlight }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={
          'text-[12px] ' +
          (faint ? 'text-charcoal-mid' : bold ? 'font-semibold text-charcoal' : 'text-charcoal-mid')
        }
      >
        {label}
      </span>
      <span
        className={
          'shrink-0 font-mono text-[13px] ' +
          (bold && highlight
            ? 'font-bold text-brand-dark'
            : bold
              ? 'font-bold text-charcoal'
              : negative
                ? 'text-scotch'
                : 'text-charcoal')
        }
      >
        {negative && value > 0 ? '-' : ''}
        {formatGBP(Math.abs(value))}
      </span>
    </div>
  );
}

// ── NumberInput ───────────────────────────────────────────────────────────

interface NumberInputProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

function NumberInput({
  id,
  label,
  hint,
  value,
  onChange,
  prefix,
  min = 0,
  max,
  step = 1,
  placeholder,
}: NumberInputProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold text-charcoal">
        {label}
      </label>
      {hint && <p className="mb-1.5 text-[11px] text-charcoal-mid">{hint}</p>}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 select-none text-sm font-semibold text-charcoal-mid">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          className={
            'w-full rounded-xl border border-cream-deep bg-white py-2.5 text-sm text-charcoal ' +
            'focus:outline-none focus:ring-2 focus:ring-brand/40 ' +
            (prefix ? 'pl-7 pr-3' : 'px-3')
          }
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function EarningsCalculator() {
  const [ownRevenue, setOwnRevenue] = useState('1200');
  const [avgOrderValue, setAvgOrderValue] = useState('35');
  const [feastpotFirstOrders, setFeastpotFirstOrders] = useState('5');
  const [feastpotRepeatOrders, setFeastpotRepeatOrders] = useState('2');
  const [aggregatorRate, setAggregatorRate] = useState(27.5);

  const models = useMemo(() => {
    // Parse inputs to pence (guard NaN and negatives).
    const toP = (s: string) => {
      const v = parseFloat(s);
      return Number.isFinite(v) && v > 0 ? roundHalfUp(v * 100) : 0;
    };
    const toCount = (s: string) => {
      const v = parseInt(s, 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    };

    return computeModels(
      toP(ownRevenue),
      toP(avgOrderValue),
      toCount(feastpotFirstOrders),
      toCount(feastpotRepeatOrders),
      aggregatorRate,
    );
  }, [ownRevenue, avgOrderValue, feastpotFirstOrders, feastpotRepeatOrders, aggregatorRate]);

  const pct = (v: number) => (v % 1 === 0 ? String(Math.trunc(v)) : String(v));

  return (
    <div className="mt-8 rounded-2xl border border-cream-deep bg-cream-warm p-5 sm:p-6">
      <h3 className="mb-1 font-display text-lg font-black text-charcoal">
        See how it compares
      </h3>
      <p className="mb-5 text-[13px] text-charcoal-mid">
        Enter your numbers below. All three models update instantly.
      </p>

      {/* Inputs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberInput
          id="calc-own-revenue"
          label="Your monthly own-customer revenue"
          hint="Revenue from customers you already have (Instagram, WhatsApp, word of mouth)"
          value={ownRevenue}
          onChange={setOwnRevenue}
          prefix="£"
          placeholder="1200"
        />
        <NumberInput
          id="calc-avg-order"
          label="Average order value"
          hint="Used to estimate transaction count for Stripe processing"
          value={avgOrderValue}
          onChange={setAvgOrderValue}
          prefix="£"
          placeholder="35"
          min={0.01}
          step={0.01}
        />
        <NumberInput
          id="calc-fp-first"
          label="New Feastpot customers per month"
          hint="Customers who find you through postcode search for the first time"
          value={feastpotFirstOrders}
          onChange={setFeastpotFirstOrders}
          placeholder="5"
        />
        <NumberInput
          id="calc-fp-repeat"
          label="Of which, returning customers"
          hint={`Returning customers pay ${pct(PLATFORM_FACTS.commission.marketplaceRepeat)}% vs ${pct(PLATFORM_FACTS.commission.marketplaceFirst)}% for first orders`}
          value={feastpotRepeatOrders}
          onChange={setFeastpotRepeatOrders}
          placeholder="2"
        />
      </div>

      {/* Aggregator rate slider */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <label
            htmlFor="calc-aggregator-rate"
            className="text-[13px] font-semibold text-charcoal"
          >
            Aggregator comparison rate
          </label>
          <span className="rounded-full bg-charcoal px-2.5 py-0.5 text-[12px] font-bold text-white">
            {pct(aggregatorRate)}%
          </span>
        </div>
        <input
          id="calc-aggregator-rate"
          type="range"
          min={25}
          max={30}
          step={0.5}
          value={aggregatorRate}
          onChange={(e) => setAggregatorRate(parseFloat(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-cream-deep accent-charcoal"
          aria-label={`Aggregator comparison rate: ${pct(aggregatorRate)}%`}
        />
        <div className="mt-1 flex justify-between text-[11px] text-charcoal-mid">
          <span>25%</span>
          <span>30%</span>
        </div>
        <p className="mt-1.5 text-[11px] text-charcoal-mid">
          Typical major aggregator range. This is a market comparison, not a Feastpot figure.
        </p>
      </div>

      {/* Results */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ResultCard
          label="Feastpot"
          rateLabel={`${pct(PLATFORM_FACTS.commission.vendorReferred)}% on own orders / ${pct(PLATFORM_FACTS.commission.marketplaceFirst)}% on new / ${pct(PLATFORM_FACTS.commission.marketplaceRepeat)}% on repeat`}
          result={models.feastpot}
          highlight
        />
        <ResultCard
          label={`Flat at ${pct(PLATFORM_FACTS.commission.marketplaceFirst)}%`}
          rateLabel={`${pct(PLATFORM_FACTS.commission.marketplaceFirst)}% on all revenue (own + marketplace)`}
          result={models.flat}
        />
        <ResultCard
          label="Typical aggregator"
          rateLabel={`${pct(aggregatorRate)}% on all revenue (market comparison)`}
          result={models.aggregator}
        />
      </div>

      {/* Small print */}
      <p className="mt-4 text-[11px] leading-relaxed text-charcoal-mid">
        * Stripe processing estimate of 1.5% + 20p per transaction is based on publicly listed UK
        Stripe card rates and is shown as an indicative external cost common to all models. Actual
        processing fees vary by card type and are set by Stripe, not Feastpot. This is not a
        commitment by Feastpot.
      </p>
    </div>
  );
}
