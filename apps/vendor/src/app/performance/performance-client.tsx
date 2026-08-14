'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

import { StatCard } from '@/components/dashboard/stat-card';
import { useAnalytics } from '@/hooks/use-analytics';
import { formatPence } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';

// Recharts can't read CSS vars at draw time - keep these as literals.
const BRAND_GREEN = '#00843D';
const VENDOR_BLUE = '#185FA5';
const GRID_GREY = '#F0EDE8';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BySource {
  source: string;
  orderCount: number;
  foodSubtotalPence: number;
  commissionPence: number;
  effectiveRatePct: number;
}
interface EarningsSummary {
  blendedRatePct: number;
  savedPence: number;
  bySource: BySource[];
}
interface EarningsData {
  period: EarningsSummary;
  cumulative: EarningsSummary;
}
interface PayoutSummary {
  foundingAllowanceGrantedPence: number;
  foundingAllowanceUsedPence: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function p(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}
function pct(n: number) {
  return `${n.toFixed(2)}%`;
}

/**
 * Weekly x-axis label: "10 Aug" instead of the weekday name (which is always
 * "Mon" when every week starts on a Monday).
 * Parsed as UTC to prevent local-timezone date shifts.
 */
function weekLabel(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, mo! - 1, d!));
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Returns the current UTC offset for Europe/London in whole hours (0 or 1).
 * Used to shift UTC hour buckets to London local time on the client.
 * During the BST changeover week a 1-day boundary error is possible and
 * accepted; the label says "Europe/London" so the vendor understands the intent.
 */
function londonUtcOffset(): number {
  const now = new Date();
  const londonHourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    hour12: false,
  }).format(now);
  const londonHour = parseInt(londonHourStr, 10);
  return (londonHour - now.getUTCHours() + 24) % 24;
}

const SOURCE_LABELS: Record<string, { label: string; colour: string }> = {
  MARKETPLACE_FIRST: {
    label: 'New marketplace customers',
    colour: 'bg-blue-100 text-blue-800',
  },
  MARKETPLACE_REPEAT: {
    label: 'Returning marketplace customers',
    colour: 'bg-sky-100 text-sky-800',
  },
  VENDOR_REFERRED: {
    label: 'Your own customers',
    colour: 'bg-green-100 text-green-800',
  },
  MARKETPLACE: {
    label: 'Marketplace',
    colour: 'bg-blue-100 text-blue-800',
  },
};

// ─── Rate schedule rows built from PLATFORM_FACTS (never empty) ──────────────

interface RateRow {
  tier: string;
  rateDisplay: string;
  note: string;
}

const RATE_ROWS: RateRow[] = [
  {
    tier: 'Your own customers',
    rateDisplay: `${PLATFORM_FACTS.commission.vendorReferred}%`,
    note: `Customers who place an order within ${PLATFORM_FACTS.attribution.vendorLinkWindowDays} days of clicking your personal share link.`,
  },
  {
    tier: 'New marketplace customers',
    rateDisplay: `${PLATFORM_FACTS.commission.marketplaceFirst}%`,
    note: `First order from a customer ${PLATFORM_FACTS.brandName} introduced to your kitchen.`,
  },
  {
    tier: 'Returning marketplace customers',
    rateDisplay: `${PLATFORM_FACTS.commission.marketplaceRepeat}%`,
    note: `Repeat orders from customers ${PLATFORM_FACTS.brandName} introduced, once you have a trading track record.`,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function PerformanceClient() {
  const { data: analyticsData, isLoading: analyticsLoading, error: analyticsError } = useAnalytics();

  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [earningsError, setEarningsError] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<PayoutSummary | null>(null);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        if (!token) {
          setEarningsError('Not authenticated');
          return;
        }
        const headers = { Authorization: `Bearer ${token}` };
        const [earningsRes, summaryRes] = await Promise.all([
          fetch(`${API}/v1/payouts/earnings-summary?year=${year}&month=${month}`, { headers }),
          fetch(`${API}/v1/payouts/summary`, { headers }),
        ]);
        if (!earningsRes.ok) throw new Error(`Earnings API error ${earningsRes.status}`);
        const earningsJson = (await earningsRes.json()) as EarningsData;
        const summaryJson = summaryRes.ok ? ((await summaryRes.json()) as PayoutSummary) : null;
        if (!cancelled) {
          setEarnings(earningsJson);
          setAllowance(summaryJson);
        }
      } catch (e) {
        if (!cancelled) setEarningsError((e as Error).message);
      } finally {
        if (!cancelled) setEarningsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  // ── Derived analytics data ────────────────────────────────────────────────

  const weekly = useMemo(() => analyticsData?.weeklyRevenue ?? [], [analyticsData]);
  const top = analyticsData?.topDishes ?? [];

  // Shift UTC hourly buckets to Europe/London local time.
  const hourly = useMemo(() => {
    const raw = analyticsData?.hourlyDistribution ?? [];
    if (raw.length === 0) return raw;
    const offset = londonUtcOffset();
    return raw
      .map((h) => ({ hour: (h.hour + offset) % 24, ordersCount: h.ordersCount }))
      .sort((a, b) => a.hour - b.hour);
  }, [analyticsData]);

  const { revenueDelta, ordersDelta, thisWeek } = useMemo(() => {
    if (weekly.length < 2)
      return { revenueDelta: undefined, ordersDelta: undefined, thisWeek: null };
    const t = weekly[weekly.length - 1]!;
    const l = weekly[weekly.length - 2]!;
    return {
      thisWeek: t,
      revenueDelta:
        l.revenuePence === 0
          ? undefined
          : ((t.revenuePence - l.revenuePence) / l.revenuePence) * 100,
      ordersDelta:
        l.ordersCount === 0
          ? undefined
          : ((t.ordersCount - l.ordersCount) / l.ordersCount) * 100,
    };
  }, [weekly]);

  const hasOrders = weekly.some((w) => w.ordersCount > 0);

  // ── Founding allowance ────────────────────────────────────────────────────

  const foundingGranted = allowance?.foundingAllowanceGrantedPence ?? 0;
  const foundingUsed = allowance?.foundingAllowanceUsedPence ?? 0;
  const foundingRemaining = Math.max(0, foundingGranted - foundingUsed);
  const hasFoundingAllowance = foundingRemaining > 0;

  // ── Earnings ─────────────────────────────────────────────────────────────

  const period = earnings?.period;
  const cumulative = earnings?.cumulative;
  const hasEarnings = !!period && period.bySource.length > 0;

  const monthLabel = new Date(year, month - 1).toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Page header */}
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">Performance</h1>
        <p className="mt-1 text-sm text-mid">
          <strong className="font-semibold text-dark">Net revenue</strong> on this page means the
          food subtotal and delivery fee, minus Feastpot commission. Stripe card-processing fees are
          deducted separately by Stripe at transfer time.
        </p>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          PART 1 - HOW MUCH YOU SOLD
      ══════════════════════════════════════════════════════════════════════ */}
      <section aria-labelledby="sold-heading" className="space-y-5">
        <h2 id="sold-heading" className="text-lg font-bold text-dark">
          How much you sold
        </h2>

        {analyticsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="fp-card h-28 animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : analyticsError ? (
          <div className="fp-card border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            Could not load sales data. Please refresh to try again.
          </div>
        ) : !hasOrders ? (
          <div className="fp-card border border-dashed border-border bg-white p-10 text-center">
            <p className="text-base font-semibold text-dark">No completed orders yet</p>
            <p className="mt-2 text-sm text-mid">
              Your sales figures will appear here once your first order completes.
            </p>
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                iconKey="revenue"
                label="Revenue this week (net)"
                value={Math.round((thisWeek?.revenuePence ?? 0) / 100)}
                prefix="£"
                color="brand"
                change={revenueDelta}
              />
              <StatCard
                iconKey="orders"
                label="Orders this week"
                value={thisWeek?.ordersCount ?? 0}
                color="teal"
                change={ordersDelta}
              />
              <StatCard
                iconKey="revenue"
                label="Avg basket size"
                value={Math.round((analyticsData?.averageOrderValuePence ?? 0) / 100)}
                prefix="£"
                color="vendor"
              />
              <StatCard
                iconKey="pending"
                label="Return rate"
                value={Math.round(analyticsData?.reorderRatePct ?? 0)}
                suffix="%"
                color="amber"
              />
            </div>

            {/* Weekly revenue chart */}
            <div className="fp-card border border-border bg-white">
              <div className="border-b border-border px-5 py-4">
                <h3 className="text-base font-bold text-dark">Weekly net revenue</h3>
                <p className="mt-0.5 text-xs text-mid">Last 8 weeks, after commission.</p>
              </div>
              <div className="h-64 px-3 pb-4 pt-3">
                {weekly.length === 0 ? (
                  <p className="px-2 py-4 text-sm text-mid">No revenue yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={weekly.map((w) => ({
                        name: weekLabel(w.weekStart),
                        revenue: w.revenuePence / 100,
                      }))}
                      margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_GREY} vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#5F5E5A' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#5F5E5A' }}
                        tickFormatter={(v: number) => `£${v}`}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(232,82,10,0.08)' }}
                        contentStyle={{
                          background: '#fff',
                          border: '1px solid #E5E5E0',
                          borderRadius: 12,
                          boxShadow: '0 4px 16px rgba(28,28,26,0.08)',
                          fontSize: 12,
                        }}
                        labelStyle={{ color: '#1C1C1A', fontWeight: 600 }}
                        formatter={(v: number) => [`£${v.toFixed(2)}`, 'Net revenue']}
                      />
                      <Bar dataKey="revenue" fill={BRAND_GREEN} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Hourly distribution */}
            <div className="fp-card border border-border bg-white">
              <div className="border-b border-border px-5 py-4">
                <h3 className="text-base font-bold text-dark">Hourly order distribution</h3>
                <p className="mt-0.5 text-xs text-mid">
                  Europe/London time, last 90 days. BST (UTC+1) applies late March to late October;
                  GMT (UTC+0) otherwise.
                </p>
              </div>
              <div className="h-56 px-3 pb-4 pt-3">
                {hourly.length === 0 ? (
                  <p className="px-2 py-4 text-sm text-mid">No orders to chart yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={hourly.map((h) => ({
                        name: `${String(h.hour).padStart(2, '0')}:00`,
                        orders: h.ordersCount,
                      }))}
                      margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_GREY} vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: '#5F5E5A' }}
                        interval={2}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#5F5E5A' }}
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#fff',
                          border: '1px solid #E5E5E0',
                          borderRadius: 12,
                          boxShadow: '0 4px 16px rgba(28,28,26,0.08)',
                          fontSize: 12,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="orders"
                        stroke={VENDOR_BLUE}
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Top dishes */}
            <div className="fp-card border border-border bg-white">
              <div className="border-b border-border px-5 py-4">
                <h3 className="text-base font-bold text-dark">Top dishes by revenue</h3>
                <p className="mt-0.5 text-xs text-mid">Best sellers over the last 90 days.</p>
              </div>
              {top.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-mid">Not enough data yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface text-left text-[11px] uppercase tracking-wide text-mid">
                      <th className="px-5 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Dish</th>
                      <th className="px-3 py-2 text-right font-semibold">Orders</th>
                      <th className="px-5 py-2 text-right font-semibold">Net revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {top.map((d, idx) => (
                      <tr key={d.menuItemId} className="bg-white">
                        <td className="px-5 py-3 font-bold tabular-nums text-dark">{idx + 1}</td>
                        <td className="px-3 py-3 text-dark">{d.name}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-mid">
                          {d.ordersCount}
                        </td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-brand">
                          {formatPence(d.revenuePence)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          PART 2 - WHAT IT COST YOU
      ══════════════════════════════════════════════════════════════════════ */}
      <section aria-labelledby="cost-heading" className="space-y-5">
        <div>
          <h2 id="cost-heading" className="text-lg font-bold text-dark">
            What it cost you
          </h2>
          <p className="mt-0.5 text-sm text-mid">{monthLabel}</p>
        </div>

        {earningsLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-28 animate-pulse rounded-xl bg-gray-200" />
            ))}
          </div>
        ) : earningsError ? (
          <div className="fp-card border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-base font-semibold text-red-800">Could not load earnings</p>
            <p className="mt-2 text-sm text-red-700">
              There was a problem fetching your earnings. Please refresh to try again.
            </p>
          </div>
        ) : (
          <>
            {/* Founding allowance callout */}
            {hasFoundingAllowance && (
              <div className="fp-card border border-brand/20 bg-brand/5 p-5">
                <p className="font-semibold text-brand">
                  Founding allowance: {p(foundingRemaining)} remaining
                </p>
                <p className="mt-1 text-sm text-mid">
                  As a founding cook you were granted {p(foundingGranted)} of commission-free food
                  sales. You have used {p(foundingUsed)} so far. While allowance remains, your
                  blended commission rate is 0.00% (this is correct, not a bug).
                </p>
              </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div
                className={`fp-card border p-5 ${
                  (period?.blendedRatePct ?? 0) < 10
                    ? 'border-green-200 bg-green-50'
                    : 'border-border bg-white'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-mid">
                  Blended rate this month
                </p>
                <p
                  className={`mt-2 text-3xl font-bold tabular-nums ${
                    (period?.blendedRatePct ?? 0) < 10 ? 'text-green-700' : 'text-dark'
                  }`}
                >
                  {pct(period?.blendedRatePct ?? 0)}
                </p>
                <p className="mt-1 text-xs text-mid">Weighted average across all orders</p>
              </div>
              <div
                className={`fp-card border p-5 ${
                  (period?.savedPence ?? 0) > 0
                    ? 'border-green-200 bg-green-50'
                    : 'border-border bg-white'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-mid">
                  Saved vs standard rate
                </p>
                <p
                  className={`mt-2 text-3xl font-bold tabular-nums ${
                    (period?.savedPence ?? 0) > 0 ? 'text-green-700' : 'text-dark'
                  }`}
                >
                  {p(period?.savedPence ?? 0)}
                </p>
                <p className="mt-1 text-xs text-mid">Thanks to referrals and repeat customers</p>
              </div>
              <div
                className={`fp-card border p-5 ${
                  (cumulative?.savedPence ?? 0) > 0
                    ? 'border-green-200 bg-green-50'
                    : 'border-border bg-white'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-mid">
                  Saved all-time
                </p>
                <p
                  className={`mt-2 text-3xl font-bold tabular-nums ${
                    (cumulative?.savedPence ?? 0) > 0 ? 'text-green-700' : 'text-dark'
                  }`}
                >
                  {p(cumulative?.savedPence ?? 0)}
                </p>
                <p className="mt-1 text-xs text-mid">Cumulative since you joined</p>
              </div>
            </div>

            {/* Commission by source */}
            {!hasEarnings ? (
              <div className="fp-card border border-dashed border-border bg-white p-8 text-center">
                <p className="text-sm text-mid">No completed orders this month yet.</p>
              </div>
            ) : (
              <div className="fp-card border border-border bg-white p-5">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-mid">
                  This month, by customer source
                </h3>
                <div className="space-y-3">
                  {period!.bySource.map((row) => {
                    const info = SOURCE_LABELS[row.source] ?? {
                      label: row.source,
                      colour: 'bg-gray-100 text-gray-700',
                    };
                    return (
                      <div
                        key={row.source}
                        className="flex items-start gap-3 rounded-lg bg-surface p-3"
                      >
                        <span
                          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${info.colour}`}
                        >
                          {info.label}
                        </span>
                        <div className="flex-1 text-sm">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-dark">
                            <span>{row.orderCount} orders</span>
                            <span>Food subtotal {p(row.foodSubtotalPence)}</span>
                            <span>Commission {p(row.commissionPence)}</span>
                            <span className="font-semibold">
                              Effective rate {pct(row.effectiveRatePct)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rate schedule: built from PLATFORM_FACTS, never empty */}
            <div className="fp-card border border-border bg-white p-5">
              <h3 className="mb-1 text-[13px] font-black uppercase tracking-[0.1em] text-mid">
                Rate Schedule (Annex A)
              </h3>
              <p className="mb-4 text-xs text-mid">
                Commission applies to the{' '}
                <strong className="font-semibold text-dark">
                  {PLATFORM_FACTS.commission.basis}
                </strong>
                . Delivery fees, service charges, and tips are never included in the commission
                calculation.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th
                      scope="col"
                      className="py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-mid"
                    >
                      Customer tier
                    </th>
                    <th
                      scope="col"
                      className="py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-mid"
                    >
                      Commission rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {RATE_ROWS.map((row) => (
                    <tr key={row.tier} className="align-top">
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-dark">{row.tier}</p>
                        <p className="mt-0.5 text-[11px] text-mid">{row.note}</p>
                      </td>
                      <td className="py-3 text-right text-base font-bold tabular-nums text-brand">
                        {row.rateDisplay}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 space-y-1.5 border-t border-border pt-4">
                <p className="text-[11px] text-mid">
                  <strong className="font-semibold text-dark">Commission and fee changes</strong>{' '}
                  : {PLATFORM_FACTS.feeChangeNoticeDays} days written notice before any increase to
                  commission rates or service fees. Changes are never applied retrospectively.
                </p>
                <p className="text-[11px] text-mid">
                  <strong className="font-semibold text-dark">General terms changes</strong> -{' '}
                  {PLATFORM_FACTS.termsNoticeDays} days notice under the UK P2B Regulation (clause
                  10 of the Vendor Terms). This is a shorter window that covers wording changes
                  only, not rate changes.
                </p>
              </div>
            </div>

            {/* Referral CTA */}
            <div className="fp-card border border-green-200 bg-green-50 p-5">
              <p className="font-semibold text-green-800">
                Grow your referrals to keep more of every order
              </p>
              <p className="mt-1 text-sm text-green-700">
                Your own customers pay 0% commission on the food subtotal. Stripe card-processing
                fees still apply at the time of payout transfer, but the platform commission is
                zero. Share your link or QR code to turn new diners into regulars.
              </p>
              <a
                href="/share"
                className="mt-3 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                Get your share link
              </a>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
