'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { COMMISSION_RATES } from '@feastpot/config/commission-rates';
import type { RateRow } from '@feastpot/ui';

import { useTrackEvent } from '@/hooks/use-track-event';

// ── Stripe processing estimate ──────────────────────────────────────────────
//
// EXTERNAL ESTIMATE only. 1.5 % + 20p per transaction is the publicly listed
// UK Stripe card rate. This is NOT a Feastpot fee, rate or commitment.
// Stripe sets this; Feastpot does not mark it up.
const STRIPE_VARIABLE_RATE = 0.015;
const STRIPE_FIXED_PENCE = 20;

const RATE_KEYS = {
  vendorReferred: 'referred_commission',
  marketplaceFirst: 'standard_commission',
  marketplaceRepeat: 'repeat_commission',
  customerServiceFee: 'customer_service_fee',
} as const;

// ── External market estimate: major aggregator commission band ───────────────
// NOT a Feastpot figure. Used only in the prose comparison lines.
const AGGREGATOR_LOW_PCT = 25;
const AGGREGATOR_HIGH_PCT = 30;

// ── Preset worked examples ───────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'A £15 plate', valuePence: 1500 },
  { label: 'A £250 catering tray', valuePence: 25000 },
] as const;

// ── Maths helpers ────────────────────────────────────────────────────────────

/** Round half up to the nearest integer (schoolbook rounding). */
function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

/** Format pence as GBP with thousands separators and exactly two decimals. */
function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pence / 100);
}

/** Format pence as GBP rounded to whole pounds (for monthly totals). */
function formatGBPWhole(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(pence / 100));
}

/** Format a Stripe fee pence value for the footnote: "43p" below 100p, "£3.95" above. */
function formatStripeFee(pence: number): string {
  return pence < 100 ? `${pence}p` : formatGBP(pence);
}

/** Format a percentage without trailing decimals. */
function pct(v: number): string {
  return v % 1 === 0 ? String(Math.trunc(v)) : String(v);
}

/** Stripe processing estimate for one transaction. */
function stripeSinglePence(orderPence: number): number {
  return roundHalfUp(orderPence * STRIPE_VARIABLE_RATE) + STRIPE_FIXED_PENCE;
}

/** Feastpot commission for one order at the given rate (as a whole percentage). */
function commissionPence(orderPence: number, ratePct: number): number {
  return roundHalfUp(orderPence * (ratePct / 100));
}

// ── Three-card data ──────────────────────────────────────────────────────────

interface CardData {
  key: string;
  label: string;
  figurePence: number;
  figureCaption: string;
  body: string;
  highlight: boolean;
}

function currentRateValue(rates: RateRow[], key: string, fallback: number): number {
  return rates.find((rate) => rate.key === key && rate.status === 'LIVE')?.rateValue ?? fallback;
}

function buildCards(
  orderPence: number,
  rates: {
    vendorReferred: number;
    marketplaceFirst: number;
    marketplaceRepeat: number;
  },
): CardData[] {
  const stripe = stripeSinglePence(orderPence);

  const ownFee = commissionPence(orderPence, rates.vendorReferred);
  const ownNet = orderPence - stripe - ownFee;
  const ownFeeDisplay = ownFee === 0 ? '£0.00' : formatGBP(ownFee);

  const firstFee = commissionPence(orderPence, rates.marketplaceFirst);
  const firstNet = orderPence - stripe - firstFee;

  const repeatFee = commissionPence(orderPence, rates.marketplaceRepeat);
  const repeatNet = orderPence - stripe - repeatFee;

  return [
    {
      key: 'own',
      label: 'Your own customer',
      figurePence: ownNet,
      figureCaption: 'lands in your account',
      body:
        ownFee === 0
          ? `Our fee: ${ownFeeDisplay}. They came through your link, QR code or Instagram, so we take nothing.`
          : `Our fee: ${ownFeeDisplay}. They came through your link, QR code or Instagram.`,
      highlight: true,
    },
    {
      key: 'first',
      label: 'A customer we found you',
      figurePence: firstNet,
      figureCaption: 'of business you did not have',
      body: `Our fee: ${formatGBP(firstFee)}. Someone searched their postcode and picked your kitchen.`,
      highlight: false,
    },
    {
      key: 'repeat',
      label: 'When that customer returns',
      figurePence: repeatNet,
      figureCaption: 'and it keeps repeating',
      body: `Our fee: ${formatGBP(repeatFee)}. It drops to ${pct(rates.marketplaceRepeat)}% once they are a regular of yours.`,
      highlight: false,
    },
  ];
}

// ── Sub-components ───────────────────────────────────────────────────────────

function WorkedCard({ card }: { card: CardData }) {
  return (
    <div
      className={
        'flex flex-col rounded-2xl bg-white p-5 ' +
        (card.highlight ? 'border-2 border-brand' : 'border border-cream-deep')
      }
    >
      <p
        className={
          'mb-3 text-[10px] font-black uppercase tracking-[0.14em] ' +
          (card.highlight ? 'text-brand' : 'text-charcoal-mid')
        }
      >
        {card.label}
      </p>
      <p className="font-display text-4xl font-black text-charcoal">
        {formatGBP(card.figurePence)}
      </p>
      <p className="mt-1 mb-4 text-[12px] font-semibold text-charcoal-mid">{card.figureCaption}</p>
      <p className="mt-auto text-[13px] leading-relaxed text-charcoal-mid">{card.body}</p>
    </div>
  );
}

interface SliderProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  formatValue: (v: number) => string;
}

function Slider({ id, label, min, max, step, value, onChange, formatValue }: SliderProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-semibold text-charcoal">
          {label}
        </label>
        <span
          aria-live="polite"
          aria-atomic="true"
          className="shrink-0 rounded-full bg-charcoal px-2.5 py-0.5 font-mono text-[12px] font-bold text-white"
        >
          {formatValue(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-cream-deep accent-brand"
        aria-valuetext={formatValue(value)}
      />
      <div className="mt-1 flex justify-between text-[11px] text-charcoal-mid">
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function EarningsCalculator({ rates = [] }: { rates?: RateRow[] }) {
  const [exampleIdx, setExampleIdx] = useState(0);
  // Calculator sliders
  const [orderValue, setOrderValue] = useState(15); // whole pounds
  const [ordersPerWeek, setOrdersPerWeek] = useState(10);

  const track = useTrackEvent();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      track('calculator_interaction');
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderValue, ordersPerWeek, exampleIdx]);

  // ── Worked-example derived values ──────────────────────────────────────────

  // exampleIdx is always 0 or 1 (set only by the toggle buttons above).
  // The nullish fallback satisfies TypeScript's tuple-index narrowing.
  const selectedExample = EXAMPLES[exampleIdx] ?? EXAMPLES[0];
  const examplePence = selectedExample.valuePence;

  const liveRates = useMemo(
    () => ({
      vendorReferred: currentRateValue(
        rates,
        RATE_KEYS.vendorReferred,
        COMMISSION_RATES.vendorReferred.percent,
      ),
      marketplaceFirst: currentRateValue(
        rates,
        RATE_KEYS.marketplaceFirst,
        COMMISSION_RATES.marketplaceFirst.percent,
      ),
      marketplaceRepeat: currentRateValue(
        rates,
        RATE_KEYS.marketplaceRepeat,
        COMMISSION_RATES.marketplaceRepeat.percent,
      ),
      customerServiceFee: currentRateValue(
        rates,
        RATE_KEYS.customerServiceFee,
        COMMISSION_RATES.customerServiceFee.percent,
      ),
    }),
    [rates],
  );

  const cards = useMemo(() => buildCards(examplePence, liveRates), [examplePence, liveRates]);

  const stripeFeePence = stripeSinglePence(examplePence);
  const exampleLabel = formatGBP(examplePence);

  // External market estimate for the aggregator prose line (not a Feastpot figure).
  const aggLo = formatGBP(roundHalfUp((examplePence * AGGREGATOR_LOW_PCT) / 100));
  const aggHi = formatGBP(roundHalfUp((examplePence * AGGREGATOR_HIGH_PCT) / 100));

  // ── Calculator derived values ───────────────────────────────────────────────

  const calcOrderPence = orderValue * 100; // whole pounds, no rounding needed
  // Monthly orders = weekly * 52 / 12, rounded to nearest whole order.
  const monthlyOrders = Math.round((ordersPerWeek * 52) / 12);
  const monthlyGrossPence = monthlyOrders * calcOrderPence;

  // External market estimate for the calculator comparison (not a Feastpot figure).
  const calcAggLoPence = roundHalfUp((monthlyGrossPence * AGGREGATOR_LOW_PCT) / 100);
  const calcAggHiPence = roundHalfUp((monthlyGrossPence * AGGREGATOR_HIGH_PCT) / 100);

  return (
    <div className="space-y-8">
      {/* 1. Heading block */}
      <div>
        <h2
          id="numbers-heading"
          className="font-display text-3xl font-black tracking-tight text-charcoal"
        >
          How the numbers work
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-charcoal-mid">
          Two rates. Which one applies depends on one thing: did we bring you the customer, or did
          you?
        </p>
      </div>

      {/* 2. Example selector */}
      <div>
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-charcoal-mid">
          Pick an example
        </p>
        <div className="inline-flex gap-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setExampleIdx(i)}
              aria-pressed={exampleIdx === i}
              className={
                'rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ' +
                (exampleIdx === i
                  ? 'bg-brand text-white'
                  : 'border border-cream-deep bg-white text-charcoal hover:border-brand hover:text-brand')
              }
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Three cards (stacks on narrow viewports, three columns from sm up) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <WorkedCard key={card.key} card={card} />
        ))}
      </div>

      {/* 4. Stripe footnote - updates with selected example */}
      <p className="text-[12px] leading-relaxed text-charcoal-mid">
        All three figures are after Stripe&apos;s card processing of about{' '}
        <strong>{formatStripeFee(stripeFeePence)}</strong> on a <strong>{exampleLabel}</strong>{' '}
        order. Stripe charges that on every card payment, including your own customers. It is their
        fee, set by them, and we add nothing on top.
      </p>

      {/* 4b. Service fee explanation - what keeps the platform running at 0% commission */}
      <div className="rounded-2xl bg-brand-light px-5 py-4">
        <p className="text-[13px] font-bold text-charcoal">
          So how do we make money at {pct(liveRates.vendorReferred)}%?
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-charcoal-mid">
          Your customers pay a small service fee to Feastpot, {pct(liveRates.customerServiceFee)}%
          capped at £{(PLATFORM_FACTS.serviceFee.capPence / 100).toFixed(2)}. It comes from them,
          never from your payout, and it is what keeps the platform running while you are paying us
          no commission.
        </p>
      </div>

      {/* 5. Aggregator comparison - a prose line, no inputs, no table column */}
      <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-cream-deep">
        <p className="text-[13px] leading-relaxed text-charcoal-mid">
          On Deliveroo or Uber Eats, a {exampleLabel} order costs you roughly{' '}
          <strong className="text-charcoal">
            {aggLo} to {aggHi}
          </strong>{' '}
          in commission. If that customer is already yours, here it costs you nothing.
        </p>
      </div>

      {/* 6. Calculator */}
      <div>
        <div className="my-2 border-t border-cream-deep" />

        <h3 className="mt-8 mb-1 font-display text-xl font-black text-charcoal">
          Your kitchen, your numbers
        </h3>
        <p className="mb-6 text-[13px] text-charcoal-mid">
          Adjust the sliders to see how your book looks across a month.
        </p>

        <div className="space-y-6">
          <Slider
            id="calc-order-value"
            label="A typical order is"
            min={10}
            max={400}
            step={5}
            value={orderValue}
            onChange={setOrderValue}
            formatValue={(v) => `£${v}`}
          />
          <Slider
            id="calc-orders-week"
            label="Orders a week"
            min={1}
            max={60}
            step={1}
            value={ordersPerWeek}
            onChange={setOrdersPerWeek}
            formatValue={(v) => String(v)}
          />
        </div>

        <div className="mt-6 rounded-2xl bg-white px-5 py-4 ring-1 ring-cream-deep">
          <p className="text-[14px] leading-relaxed text-charcoal">
            About <strong>{monthlyOrders}</strong> orders a month, so roughly{' '}
            <strong>{formatGBPWhole(monthlyGrossPence)}</strong> a month. If those are your own
            customers, you keep all of it here. The same book on a major aggregator would cost you{' '}
            <strong>
              {formatGBPWhole(calcAggLoPence)} to {formatGBPWhole(calcAggHiPence)}
            </strong>{' '}
            a month in commission.
          </p>
        </div>
      </div>
    </div>
  );
}
