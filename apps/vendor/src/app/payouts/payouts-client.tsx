'use client';

import { cn } from '@feastpot/ui';
import {
  AlertCircle,
  Banknote,
  Calendar,
  CalendarCheck,
  Clock,
  HelpCircle,
  Percent,
  PoundSterling,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';

import { usePayouts, type PayoutStatus, type VendorPayout } from '@/hooks/use-payouts';
import { formatDate, formatPence } from '@/lib/format';

import { DownloadCsvButton } from './download-csv-button';

/**
 * Payouts dashboard — redesigned to match the Vendor8 mockup.
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
 *   [How payouts work — teal-tinted explainer card with 4 rows +
 *    decorative calendar icon]
 *   [hold-reason banner — only when there's a held payout]
 *   [4 KPI cards — Pending net / Pending gross / Commission /
 *    Refunds]
 *   [History — subtitle + Download statement CTA]
 *   [Table]
 *   [Pagination footer — "Showing N of …" + Load more]
 */
export function PayoutsClient() {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = usePayouts();

  const payouts: VendorPayout[] = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

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

      {/* Hold-reason banner — kept distinct from the explainer because
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
          hint="12% of order subtotal"
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
            Weekly transfers run every Monday for the previous Mon–Sun window.
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
    title: 'Weekly every Monday.',
    detail:
      'Your payout is calculated at midnight on Sunday and transferred Monday morning.',
  },
  {
    Icon: PoundSterling,
    title: 'You keep 88%.',
    detail:
      'Feastpot charges 12% commission on the order subtotal. Delivery fees are separate.',
  },
  {
    Icon: Clock,
    title: '3 to 5 working days to your bank.',
    detail: 'Stripe Transfer typically arrives within 3 to 5 working days of Monday.',
  },
  {
    Icon: HelpCircle,
    title: 'Query a payout.',
    detail:
      'Email vendors@feastpot.co.uk with your kitchen name and the week in question.',
  },
];

function ExplainerCard() {
  return (
    <section className="fp-card relative overflow-hidden border border-teal/30 bg-teal-light p-5">
      <div className="grid items-center gap-4 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <h2 className="mb-3 text-base font-bold text-dark">How FeastPot payouts work</h2>
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
        {/* Decorative illustration — pure CSS so it stays sharp at any
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

// ── Table ──────────────────────────────────────────────────────────

/**
 * Source statuses collapse into four vendor-facing pills. `draft` and
 * `held` both read as "Pending" (a held payout is escalated separately
 * via the hold-reason banner above the table). `approved` and
 * `transferred` are kept distinct: approved means the amount is
 * finalized but funds aren't in the bank yet, transferred means the
 * Stripe wire actually completed — collapsing the two into "Paid"
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
        pill.tone === 'processing' && 'bg-vendor-light text-vendor-dark',
        pill.tone === 'pending' && 'bg-amber-50 text-amber-700',
        pill.tone === 'failed' && 'bg-red-50 text-red-700',
      )}
    >
      {pill.label}
    </span>
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
              <tr key={p.id} className="border-t border-border text-dark">
                <td className="px-4 py-3">{formatDate(p.periodEnd)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPence(p.grossPence)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-mid">
                  −{formatPence(p.commissionPence)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-mid">
                  −{formatPence(p.refundsPence)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {formatPence(p.amountPence)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-mid">
                  {p.transferredAt ? formatDate(p.transferredAt) : 'Not yet'}
                </td>
              </tr>
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
