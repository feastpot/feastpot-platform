'use client';

import { cn } from '@feastpot/ui';
import { Bike, ClipboardList, PoundSterling, ShieldAlert, Sparkles, Users } from 'lucide-react';

import type { VendorOrder, VendorOrderStatus } from '@/hooks/use-vendor-orders';
import { useVendorDashboard } from '@/hooks/use-vendor-dashboard';
import { useVendorStats } from '@/hooks/use-vendor-stats';

export type QuickFilter = 'all' | 'high_value' | 'has_notes';

interface Props {
  counts: Record<VendorOrderStatus, number>;
  activeTab: VendorOrderStatus;
  onTabChange: (tab: VendorOrderStatus) => void;
  /** Orders belonging to the currently-selected tab. Quick-filter counts
   *  are derived from this list so the rail always reflects the same
   *  base set the main panel is filtering. */
  tabOrders: VendorOrder[];
  quickFilter: QuickFilter;
  onQuickFilterChange: (filter: QuickFilter) => void;
}

const SUMMARY_ROWS: Array<{ status: VendorOrderStatus; label: string; tone: 'pending' | 'preparing' | 'dispatched' | 'delivered' }> = [
  { status: 'pending', label: 'Pending', tone: 'pending' },
  { status: 'preparing', label: 'Preparing', tone: 'preparing' },
  { status: 'dispatched', label: 'Dispatched', tone: 'dispatched' },
  { status: 'delivered', label: 'Delivered', tone: 'delivered' },
];

const DOT_TONE: Record<'pending' | 'preparing' | 'dispatched' | 'delivered', string> = {
  pending: 'bg-brand',
  preparing: 'bg-amber-500',
  dispatched: 'bg-teal',
  delivered: 'bg-teal',
};

function formatMoney(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Left-rail summary used on the Orders dashboard. Three stacked cards:
 *   1. Order summary  — clickable status counts, doubles as a vertical tab
 *      switcher mirroring the horizontal tab pills above.
 *   2. Today at a glance — orders today, scheduled value, avg order value.
 *      Uses the same /vendors/me/stats + /vendors/me/dashboard endpoints
 *      already feeding the home dashboard so no new API surface required.
 *   3. Quick filters — client-side filters over the currently-visible
 *      orders. The mockup also shows Delivery/Collection and allergen
 *      filters; those are skipped because the VendorOrder shape doesn't
 *      expose deliveryType or allergens today. Wire them up when the API
 *      adds those fields (no UI changes needed beyond extending the
 *      `QuickFilter` union + filter logic in orders-dashboard.tsx).
 */
export function OrdersSummaryRail({
  counts,
  activeTab,
  onTabChange,
  tabOrders,
  quickFilter,
  onQuickFilterChange,
}: Props) {
  const { data: stats } = useVendorStats();
  const { data: dashboard } = useVendorDashboard();

  const ordersToday = stats?.today.orders ?? 0;
  const todayRevenuePence = stats?.today.revenuePence ?? 0;
  const scheduledValuePence = (dashboard?.ordersDueToday ?? []).reduce(
    (acc, o) => acc + o.totalPence,
    0,
  );
  const avgOrderValuePence = ordersToday > 0 ? Math.round(todayRevenuePence / ordersToday) : 0;

  const highValueCount = tabOrders.filter((o) => o.totalPence >= 15000).length;
  const hasNotesCount = tabOrders.filter((o) => !!o.notes && o.notes.trim().length > 0).length;

  return (
    <div className="space-y-4">
      <section className="fp-card border border-border bg-white p-4">
        <h2 className="text-sm font-bold text-dark">Order summary</h2>
        <ul className="mt-3 space-y-0.5">
          {SUMMARY_ROWS.map((row) => {
            const active = activeTab === row.status;
            const count = counts[row.status];
            return (
              <li key={row.status}>
                <button
                  type="button"
                  onClick={() => onTabChange(row.status)}
                  aria-pressed={active}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-teal-light text-teal-dark'
                      : 'text-mid hover:bg-surface hover:text-dark',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', DOT_TONE[row.tone])} />
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span className="text-xs font-semibold tabular-nums">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="fp-card border border-border bg-white p-4">
        <h2 className="text-sm font-bold text-dark">Today at a glance</h2>
        <dl className="mt-3 space-y-2.5">
          <StatRow Icon={ClipboardList} label="Orders today" value={String(ordersToday)} />
          <StatRow Icon={PoundSterling} label="Scheduled value" value={formatMoney(scheduledValuePence)} />
          <StatRow Icon={Sparkles} label="Avg order value" value={formatMoney(avgOrderValuePence)} />
        </dl>
      </section>

      <section className="fp-card border border-border bg-white p-4">
        <h2 className="text-sm font-bold text-dark">Quick filters</h2>
        <ul className="mt-3 space-y-0.5">
          <FilterRow
            Icon={Users}
            label="All in this tab"
            count={tabOrders.length}
            active={quickFilter === 'all'}
            onClick={() => onQuickFilterChange('all')}
          />
          <FilterRow
            Icon={Bike}
            label="High value (>£150)"
            count={highValueCount}
            active={quickFilter === 'high_value'}
            onClick={() => onQuickFilterChange('high_value')}
          />
          <FilterRow
            Icon={ShieldAlert}
            label="With customer notes"
            count={hasNotesCount}
            active={quickFilter === 'has_notes'}
            onClick={() => onQuickFilterChange('has_notes')}
          />
        </ul>
      </section>
    </div>
  );
}

function StatRow({ Icon, label, value }: { Icon: typeof PoundSterling; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-2 text-xs text-mid">
        <Icon className="h-3.5 w-3.5 text-mid" aria-hidden />
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums text-dark">{value}</dd>
    </div>
  );
}

function FilterRow({
  Icon,
  label,
  count,
  active,
  onClick,
}: {
  Icon: typeof Bike;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
          active
            ? 'bg-teal-light text-teal-dark'
            : 'text-mid hover:bg-surface hover:text-dark',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-teal' : 'text-mid')} aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <span className="text-xs font-semibold tabular-nums">{count}</span>
      </button>
    </li>
  );
}
