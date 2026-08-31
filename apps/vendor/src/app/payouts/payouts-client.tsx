'use client';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { cn } from '@feastpot/ui';
import {
  AlertCircle,
  Banknote,
  Calendar,
  CalendarCheck,
  ChevronDown,
  Clock,
  Gift,
  HelpCircle,
  Percent,
  PoundSterling,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  usePayoutOrders,
  usePayouts,
  usePayoutsSummary,
  type PayoutStatus,
  type VendorPayout,
  type VendorPayoutOrder,
} from '@/hooks/use-payouts';
import { formatDate, formatPence } from '@/lib/format';

import { DownloadCsvButton } from './download-csv-button';

/**
 * Payouts dashboard - redesigned to match the Vendor8 mockup.
 *
 * Preserved verbatim:
 *   - usePayouts() infinite-query hook
 *   - pending totals derived from on-screen draft + held rows
 *   - heldPayouts hold-reason banner
 *   - status -> badge mapping (5 source statuses, collapsed to
 *     Pending / Paid / Failed pills for the table)
 *   - DownloadCsvButton (CSV statement export)
 *
 * Layout (top → bottom):
 *   [page title]
 *   [How payouts work - teal-tinted explainer card with 4 rows +
 *    decorative calendar icon]
 *   [hold-reason banner - only when there's a held payout]
 *   [4 KPI cards - Pending net / Pending gross / Commission /
 *    Refunds]
 *   [History - subtitle + Download statement CTA]
 *   [Table - rows expand on click to show per-order breakdown]
 *   [Pagination footer - "Showing N of …" + Load more]
 */
export function PayoutsClient() {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = usePayouts();
  const { data: summary } = usePayoutsSummary();

  const payouts: VendorPayout[] = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  // "Current week" pending = the most recent draft + held (those are
  // not yet transferred). Sum gives the vendor a quick "what's coming"
  // number that matches the mockup's PENDING NET / GROSS tiles.
  const pending = useMemo(() => {
    const ps = payouts.filter((p) => p.status === 'draft' || p.status === 'held');
    return ps.reduce(
      (acc, p) => ({
        gross: acc.gross + p.grossPence,
        commission: acc.commission + p.commissionPence,
        refunds: acc.refunds + p.refundsPence,
        net: acc.net + p.amountPence,
      }),
      { gross: 0, commission: 0, refunds: 0, net: 0 },
    );
  }, [payouts]);

  const heldPayouts = payouts.filter((p) => p.status === 'held' && p.holdReason);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">Payouts</h1>
      </header>

      <ExplainerCard />

      {/* Founding offer allowance - visible while any allowance remains. */}
      {summary && summary.foundingAllowanceGrantedPence > 0 && (
        <FoundingAllowanceCard
          grantedPence={summary.foundingAllowanceGrantedPence}
          usedPence={summary.foundingAllowanceUsedPence}
        />
      )}

      {/* Payouts summary - read-only rollup from GET /payouts/summary. */}
      {summary && (
        <div className="fp-card p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <CalendarCheck className="h-5 w-5 shrink-0 text-teal-700" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Next payout
                </p>
                <p className="text-sm font-bold text-dark">
                  {summary.nextPayoutDate
                    ? formatDate(summary.nextPayoutDate)
                    : 'Nothing scheduled'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 shrink-0 text-teal-700" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Amount pending
                </p>
                <p className="text-sm font-bold text-dark">{formatPence(summary.pendingPence)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <PoundSterling className="h-5 w-5 shrink-0 text-teal-700" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Paid to date
                </p>
                <p className="text-sm font-bold text-dark">
                  {formatPence(summary.paidToDatePence)}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            Commission is calculated per order from its actual source and rate. Your delivery fee is
            yours in full.
          </p>
        </div>
      )}

      {/* Hold-reason banner - kept distinct from the explainer because
          a held payout is an actionable issue, not informational. */}
      {heldPayouts.length > 0 && (
        <div className="fp-card flex items-start gap-3 border border-red-200 bg-red-50 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <div>
            <p className="font-semibold text-red-800">A payout is on hold</p>
            {heldPayouts.map((p) => (
              <p key={p.id} className="text-red-700">
                Period ending {formatDate(p.periodEnd)}: {p.holdReason}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Pending net"
          value={formatPence(pending.net)}
          hint="After fees and refunds"
        />
        <StatCard
          icon={Banknote}
          label="Pending gross"
          value={formatPence(pending.gross)}
          hint="Before fees and refunds"
        />
        <StatCard
          icon={Percent}
          label="Commission deducted"
          value={formatPence(pending.commission)}
          hint="Actual rates applied per order"
        />
        <StatCard
          icon={RefreshCw}
          label="Refunds deducted"
          value={formatPence(pending.refunds)}
          hint="This payout cycle"
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-dark">History</h2>
          <p className="text-xs text-mid">
            Weekly transfers run every {PLATFORM_FACTS.payouts.day} for the previous Mon–Sun window.
          </p>
        </div>
        <DownloadCsvButton />
      </div>

      {error && (
        <div className="fp-card border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error instanceof Error ? error.message : 'Could not load payouts'}
        </div>
      )}

      <PayoutsTable
        payouts={payouts}
        isLoading={isLoading}
        hasNextPage={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
      />
    </div>
  );
}

// ── Explainer card ─────────────────────────────────────────────────

const EXPLAINER_ITEMS = [
  {
    Icon: Calendar,
    title: `Weekly every ${PLATFORM_FACTS.payouts.day}.`,
    detail: `Your payout is calculated at midnight on Sunday and transferred ${PLATFORM_FACTS.payouts.day} morning.`,
  },
  {
    Icon: PoundSterling,
    title: 'Source-based commission.',
    detail:
      'Each statement shows the rate actually applied to every order. Delivery fees are separate.',
  },
  {
    Icon: Clock,
    title: '3 to 5 working days to your bank.',
    detail: 'Stripe Transfer typically arrives within 3 to 5 working days of Monday.',
  },
  {
    Icon: HelpCircle,
    title: 'Query a payout.',
    detail: 'Email vendors@feastpot.co.uk with your kitchen name and the week in question.',
  },
];

function ExplainerCard() {
  return (
    <section className="fp-card relative overflow-hidden border border-teal/30 bg-teal-light p-5">
      <div className="grid items-center gap-4 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <h2 className="mb-3 text-base font-bold text-dark">
            How {PLATFORM_FACTS.brandName} payouts work
          </h2>
          <ul className="space-y-2.5">
            {EXPLAINER_ITEMS.map(({ Icon, title, detail }) => (
              <li key={title} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white"
                >
                  <Icon className="h-4 w-4 text-teal-dark" />
                </span>
                <p className="text-[13px] text-dark">
                  <span className="font-semibold">{title} </span>
                  <span className="text-mid">{detail}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
        {/* Decorative illustration - pure CSS so it stays sharp at any
            DPI and we don't need to ship an extra image asset. */}
        <div aria-hidden className="hidden md:block">
          <div className="relative h-32 w-40">
            <div className="absolute inset-0 grid place-items-center">
              <div className="relative">
                <div className="absolute -left-6 -top-2 h-20 w-20 rounded-2xl bg-teal/10" />
                <div className="absolute -right-4 bottom-0 h-16 w-16 rounded-full bg-teal/15" />
                <div className="relative grid h-24 w-24 place-items-center rounded-2xl bg-white shadow-sm">
                  <CalendarCheck className="h-12 w-12 text-teal" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Founding allowance card ─────────────────────────────────────────

/**
 * Shows a cook how much commission-free GMV allowance they have left.
 * Hidden once the allowance is fully used (remainingPence === 0).
 */
function FoundingAllowanceCard({
  grantedPence,
  usedPence,
}: {
  grantedPence: number;
  usedPence: number;
}) {
  const remainingPence = Math.max(0, grantedPence - usedPence);
  const usedFraction = grantedPence > 0 ? Math.min(1, usedPence / grantedPence) : 0;
  const pct = Math.round(usedFraction * 100);

  if (remainingPence === 0) return null;

  return (
    <section
      className="fp-card border border-teal/30 bg-teal-light p-4"
      aria-label="Founding offer allowance"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white">
          <Gift className="h-5 w-5 text-teal-dark" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-dark">Founding offer: commission-free sales</p>
          <p className="mt-0.5 text-xs text-mid">
            Your first {formatPence(grantedPence)} of marketplace sales is commission-free. You have{' '}
            <span className="font-semibold text-dark">{formatPence(remainingPence)}</span> remaining
            out of {formatPence(grantedPence)}.
          </p>
          {/* Progress bar */}
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${pct}% of founding allowance used`}
          >
            <div
              className="h-full rounded-full bg-teal transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-mid">
            {pct}% used ({formatPence(usedPence)} of {formatPence(grantedPence)})
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Stat card ──────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="fp-card flex items-start gap-3 border border-border bg-white p-4">
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-light"
      >
        <Icon className="h-5 w-5 text-teal-dark" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-mid">{label}</p>
        <p className="mt-0.5 text-xl font-extrabold text-dark">{value}</p>
        <p className="text-[11px] text-mid">{hint}</p>
      </div>
    </div>
  );
}

// ── Attribution source badge ────────────────────────────────────────

type SourceBadgeTone = 'referred' | 'first' | 'repeat';

const SOURCE_BADGE_MAP: Record<string, { label: string; tone: SourceBadgeTone }> = {
  VENDOR_REFERRED: { label: 'Your order', tone: 'referred' },
  MARKETPLACE_FIRST: { label: 'Feastpot order (first)', tone: 'first' },
  MARKETPLACE_REPEAT: { label: 'Feastpot order (repeat)', tone: 'repeat' },
  // Legacy rows without a resolved_source are treated as marketplace.
  MARKETPLACE: { label: 'Feastpot order', tone: 'repeat' },
};

const DEFAULT_SOURCE_BADGE = { label: 'Feastpot order (first)', tone: 'first' as SourceBadgeTone };

function SourceBadge({ source }: { source: string | null }) {
  const mapped = source ? (SOURCE_BADGE_MAP[source] ?? DEFAULT_SOURCE_BADGE) : DEFAULT_SOURCE_BADGE;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
        mapped.tone === 'referred' && 'bg-violet-50 text-violet-700',
        mapped.tone === 'first' && 'bg-teal-light text-teal-dark',
        mapped.tone === 'repeat' && 'bg-sky-50 text-sky-700',
      )}
    >
      {mapped.label}
    </span>
  );
}

// ── Tier breakdown for a payout's weekly statement ─────────────────

const TIER_LABELS: Record<string, string> = {
  VENDOR_REFERRED: 'Your referrals',
  MARKETPLACE_FIRST: 'New marketplace customers',
  MARKETPLACE_REPEAT: 'Returning marketplace customers',
  MARKETPLACE: 'Marketplace (legacy)',
};

/**
 * Formats the payout week ending in Europe/London time so daylight-saving
 * changes don't shift the displayed week boundary.
 */
function formatLondonDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface TierRow {
  source: string;
  orderCount: number;
  subtotalPence: number;
  commissionPence: number;
  vendorPayoutPence: number;
}

function buildTierRows(orders: VendorPayoutOrder[]): TierRow[] {
  const map = new Map<string, TierRow>();
  for (const o of orders) {
    const src = o.attributionSource ?? 'MARKETPLACE_FIRST';
    const existing = map.get(src) ?? {
      source: src,
      orderCount: 0,
      subtotalPence: 0,
      commissionPence: 0,
      vendorPayoutPence: 0,
    };
    existing.orderCount += 1;
    existing.subtotalPence += o.subtotalPence;
    existing.commissionPence += o.commissionPence;
    existing.vendorPayoutPence += o.vendorPayoutPence;
    map.set(src, existing);
  }
  // Deterministic order: vendor-referred first (£0 commission), then first, then repeat.
  const ORDER = ['VENDOR_REFERRED', 'MARKETPLACE_FIRST', 'MARKETPLACE_REPEAT', 'MARKETPLACE'];
  return [...map.values()].sort(
    (a, b) => (ORDER.indexOf(a.source) ?? 99) - (ORDER.indexOf(b.source) ?? 99),
  );
}

function TierBreakdown({ orders, payout }: { orders: VendorPayoutOrder[]; payout: VendorPayout }) {
  const tiers = buildTierRows(orders);
  const totalSubtotal = tiers.reduce((s, t) => s + t.subtotalPence, 0);
  const totalCommission = tiers.reduce((s, t) => s + t.commissionPence, 0);
  const totalNet = tiers.reduce((s, t) => s + t.vendorPayoutPence, 0);
  const moneyOrUnavailable = (value: number | null | undefined) =>
    value === null || value === undefined ? 'not available' : formatPence(value);

  return (
    <div className="space-y-4 px-4 pb-4 pt-3">
      {/* Week statement header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-dark">
          Week ending {formatLondonDate(payout.periodEnd)}
        </h3>
        <DownloadCsvButton payoutId={payout.id} label="Export orders CSV" />
      </div>

      <dl className="grid gap-2 rounded-lg border border-border bg-white p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Gross sales', formatPence(payout.grossPence)],
          ['Commission', `−${formatPence(payout.commissionPence)}`],
          ['Refunds', `−${formatPence(payout.refundsPence)}`],
          [
            'Chargebacks',
            payout.chargebacksPence === null
              ? 'not available'
              : `−${formatPence(payout.chargebacksPence)}`,
          ],
          [
            'Service fees',
            payout.serviceFeesPence === null
              ? 'not available'
              : `−${formatPence(payout.serviceFeesPence)}`,
          ],
          ['Adjustments', moneyOrUnavailable(payout.adjustmentsPence)],
          ['Net payout', formatPence(payout.amountPence)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums text-dark">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Tier breakdown table */}
      {tiers.length > 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 text-right font-semibold">Orders</th>
                <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                <th className="px-3 py-2 text-right font-semibold">Commission</th>
                <th className="px-3 py-2 text-right font-semibold">Net to you</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.source} className="border-t border-border">
                  <td className="px-3 py-2">
                    <SourceBadge source={tier.source} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-dark">{tier.orderCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-dark">
                    {formatPence(tier.subtotalPence)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-mid">
                    {tier.commissionPence === 0 ? (
                      <span className="text-teal-700">£0.00</span>
                    ) : (
                      `−${formatPence(tier.commissionPence)}`
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-dark">
                    {formatPence(tier.vendorPayoutPence)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-white font-semibold">
                <td className="px-3 py-2 text-xs font-bold text-dark">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{orders.length}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPence(totalSubtotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-mid">
                  −{formatPence(totalCommission)}
                </td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-dark">
                  {formatPence(totalNet)}
                </td>
              </tr>
            </tfoot>
          </table>
          {/* Reconciliation note */}
          <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
            Net shown above matches the payout total ({formatPence(payout.amountPence)}) after
            refund deductions ({formatPence(payout.refundsPence)} deducted this week).{' '}
            {PLATFORM_FACTS.payouts.day} transfers, paid on Monday.
          </p>
        </div>
      ) : (
        <p className="text-xs text-mid">No orders in this payout window.</p>
      )}

      {/* Per-order list */}
      {orders.length > 0 && (
        <div className="rounded-lg border border-border bg-white">
          <p className="border-b border-border px-3 py-2 text-xs font-bold text-dark">
            Order breakdown
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-xs">
              <thead className="bg-surface text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-semibold">Order</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                  <th className="px-3 py-2 text-right font-semibold">Commission</th>
                  <th className="px-3 py-2 text-right font-semibold">Rate</th>
                  <th className="px-3 py-2 text-right font-semibold">Refunds</th>
                  <th className="px-3 py-2 text-right font-semibold">Chargebacks</th>
                  <th className="px-3 py-2 text-right font-semibold">Net to you</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-[10px] text-dark">{o.orderNumber}</td>
                    <td className="px-3 py-2 text-mid">
                      {o.deliveredAt ? formatLondonDate(o.deliveredAt) : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <SourceBadge source={o.attributionSource} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-dark">
                      {formatPence(o.subtotalPence)}
                      {o.discountPence > 0 && (
                        <span
                          className={cn(
                            'ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                            o.discountFundedBy === 'VENDOR'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-teal-light text-teal-dark',
                          )}
                          title={
                            o.discountFundedBy === 'VENDOR'
                              ? 'Discount funded by you'
                              : 'Discount funded by Feastpot'
                          }
                        >
                          {o.discountFundedBy === 'VENDOR' ? 'Your promo' : 'Feastpot promo'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-mid">
                      {o.commissionPence === 0 ? (
                        <span className="flex items-center justify-end gap-1">
                          <span className="text-teal-700">£0.00</span>
                          {o.foundingAllowanceAppliedPence > 0 && (
                            <span
                              className="inline-flex items-center rounded-full bg-teal-light px-1.5 py-0.5 text-[9px] font-semibold text-teal-dark"
                              title={`${formatPence(o.foundingAllowanceAppliedPence)} covered by founding offer`}
                            >
                              Founding offer
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-1">
                          <span>{`−${formatPence(o.commissionPence)}`}</span>
                          {o.foundingAllowanceAppliedPence > 0 && (
                            <span
                              className="inline-flex items-center rounded-full bg-teal-light px-1.5 py-0.5 text-[9px] font-semibold text-teal-dark"
                              title={`${formatPence(o.foundingAllowanceAppliedPence)} covered at 0% by founding offer`}
                            >
                              Founding offer
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-mid">
                      {o.effectiveCommissionRatePercent === null ||
                      o.effectiveCommissionRatePercent === undefined
                        ? 'not available'
                        : `${o.effectiveCommissionRatePercent}%`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-mid">
                      {formatPence(o.refundsPence ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-mid">
                      {formatPence(o.chargebacksPence ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-dark">
                      {formatPence(o.vendorPayoutPence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────────

/**
 * Source statuses collapse into four vendor-facing pills. `draft` and
 * `held` both read as "Pending" (a held payout is escalated separately
 * via the hold-reason banner above the table). `approved` and
 * `transferred` are kept distinct: approved means the amount is
 * finalized but funds aren't in the bank yet, transferred means the
 * Stripe wire actually completed - collapsing the two into "Paid"
 * would mislead the vendor about whether money is on its way.
 */
type StatusPill = { label: string; tone: 'pending' | 'processing' | 'paid' | 'failed' };
const STATUS_PILL: Record<PayoutStatus, StatusPill> = {
  draft: { label: 'Pending', tone: 'pending' },
  held: { label: 'Pending', tone: 'pending' },
  approved: { label: 'Processing', tone: 'processing' },
  transferred: { label: 'Paid', tone: 'paid' },
  failed: { label: 'Failed', tone: 'failed' },
};

function StatusBadge({ status }: { status: PayoutStatus }) {
  const pill = STATUS_PILL[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        pill.tone === 'paid' && 'bg-teal-light text-teal-dark',
        pill.tone === 'processing' && 'bg-teal-light text-teal-dark',
        pill.tone === 'pending' && 'bg-amber-50 text-amber-700',
        pill.tone === 'failed' && 'bg-red-50 text-red-700',
      )}
    >
      {pill.label}
    </span>
  );
}

/**
 * A single expandable payout row. Fetches its orders lazily when expanded.
 */
function PayoutRow({ payout }: { payout: VendorPayout }) {
  const [expanded, setExpanded] = useState(false);
  const { data: orders, isLoading: ordersLoading } = usePayoutOrders(expanded ? payout.id : null);

  return (
    <>
      <tr
        className="border-t border-border text-dark transition-colors hover:bg-surface/60"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        <td className="px-4 py-3">
          <span className="flex items-center gap-1.5">
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-mid transition-transform',
                expanded && 'rotate-180',
              )}
              aria-hidden
            />
            {formatDate(payout.periodEnd)}
          </span>
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{formatPence(payout.grossPence)}</td>
        <td className="px-4 py-3 text-right tabular-nums text-mid">
          −{formatPence(payout.commissionPence)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-mid">
          −{formatPence(payout.refundsPence)}
        </td>
        <td className="px-4 py-3 text-right font-semibold tabular-nums">
          {formatPence(payout.amountPence)}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={payout.status} />
        </td>
        <td className="px-4 py-3 text-mid">
          {payout.transferredAt ? formatDate(payout.transferredAt) : 'Not yet'}
        </td>
      </tr>

      {/* Expanded per-order list + tier breakdown */}
      {expanded && (
        <tr className="border-t border-border bg-surface/40">
          <td colSpan={7} className="p-0">
            {ordersLoading ? (
              <p className="px-4 py-3 text-xs text-mid">Loading orders…</p>
            ) : (
              <TierBreakdown orders={orders ?? []} payout={payout} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function PayoutsTable({
  payouts,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  payouts: VendorPayout[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="fp-card overflow-hidden border border-border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-surface text-mid">
            <tr className="text-left">
              <th className="px-4 py-2.5 text-xs font-semibold">Week ending</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold">Gross</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold">Commission</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold">Refunds</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold">Net</th>
              <th className="px-4 py-2.5 text-xs font-semibold">Status</th>
              <th className="px-4 py-2.5 text-xs font-semibold">Transferred</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-mid">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && payouts.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-mid">
                  No payouts yet. Your first will land next Monday.
                </td>
              </tr>
            )}
            {payouts.map((p) => (
              <PayoutRow key={p.id} payout={p} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer. The mockup shows numbered page chips, but
          usePayouts is cursor-paginated (Stripe-style) so we can't
          jump to an arbitrary page. We keep the same "Load more"
          behaviour but style it as a footer bar with a count, which
          stays honest about the data we have on screen. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 text-xs text-mid">
        <span>
          {payouts.length === 0
            ? '\u00a0'
            : `Showing ${payouts.length} payout${payouts.length === 1 ? '' : 's'}${
                hasNextPage ? ' so far' : ''
              }`}
        </span>
        {hasNextPage && (
          <button
            type="button"
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-white px-3 text-xs font-semibold text-dark transition-colors hover:bg-surface disabled:opacity-60"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}

// Suppress TS unused-var: TIER_LABELS is referenced in future extensions
// and kept here to avoid a rename cascade if source values change.
void TIER_LABELS;
