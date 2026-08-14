'use client';

import { cn } from '@feastpot/ui';
import {
  Bike,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  PoundSterling,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  StickyNote,
  Truck,
  Users,
  XCircle,
} from 'lucide-react';

import type { VendorOrder } from '@/hooks/use-vendor-orders';
import { useVendorDashboard } from '@/hooks/use-vendor-dashboard';
import { useVendorStats } from '@/hooks/use-vendor-stats';
import type { CateringBooking } from '@/lib/api/catering-bookings';

// ── Shared types exported for the dashboard ────────────────────────────────

export type TypeFilter = 'all' | 'standard' | 'catering';

export type QuickFilter =
  | 'all'
  | 'high_value'
  | 'has_notes'
  | 'delivery'
  | 'collection'
  | 'has_allergens'
  // Catering-specific - visible when catering is in scope (all or catering view)
  | 'catering_quote_sent'
  | 'catering_balance_due'
  | 'catering_this_week';

export interface AllCounts {
  needs_action: number;
  in_progress: number;
  completed: number;
  cancelled: number;
}

export interface StandardCounts {
  pending: number;
  preparing: number;
  dispatched: number;
  delivered: number;
}

export interface CateringCounts {
  QUOTED: number;
  DEPOSIT_PAID: number;
  CONFIRMED: number;
  BALANCE_PAID: number;
  COMPLETED: number;
  CANCELLED: number;
  upcomingEventsCount: number;
  confirmedGmvPence: number;
}

interface Props {
  typeFilter: TypeFilter;
  allCounts: AllCounts;
  standardCounts: StandardCounts;
  cateringCounts: CateringCounts;
  currentTab: string;
  onTabChange: (tab: string) => void;
  /** Orders in the currently selected tab - used for quick-filter count derivation. */
  tabOrders: VendorOrder[];
  /** Catering bookings in the currently selected tab. */
  tabCaterings: CateringBooking[];
  quickFilter: QuickFilter;
  onQuickFilterChange: (f: QuickFilter) => void;
}

/** True when any line item's dish lists at least one allergen. */
export function orderHasAllergens(order: VendorOrder): boolean {
  return order.items.some((i) => (i.menuItem?.allergens?.length ?? 0) > 0);
}

function formatMoney(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Left-rail summary for the combined Orders + Catering dashboard.
 *
 * Renders in three modes driven by typeFilter:
 *   'all'      - unified Work summary + Today at a glance + Catering at a glance + all filters
 *   'standard' - Order summary + Today at a glance + standard filters
 *   'catering' - Catering summary + Catering at a glance + catering filters
 */
export function OrdersSummaryRail({
  typeFilter,
  allCounts,
  standardCounts,
  cateringCounts,
  currentTab,
  onTabChange,
  tabOrders,
  tabCaterings,
  quickFilter,
  onQuickFilterChange,
}: Props) {
  const { data: stats } = useVendorStats();
  const { data: dashboard } = useVendorDashboard();

  // ── Today at a glance (orders stats, shown in all + standard modes) ──
  const ordersToday = stats?.today.orders ?? 0;
  const todayRevenuePence = stats?.today.revenuePence ?? 0;
  const scheduledValuePence = (dashboard?.ordersDueToday ?? []).reduce(
    (acc, o) => acc + o.totalPence,
    0,
  );
  const avgOrderValuePence = ordersToday > 0 ? Math.round(todayRevenuePence / ordersToday) : 0;

  // ── Quick-filter counts derived from current-tab items ───────────────
  const now = Date.now();
  const totalTabCount = tabOrders.length + tabCaterings.length;
  const highValueCount = tabOrders.filter((o) => o.totalPence >= 15000).length;
  const hasNotesCount = tabOrders.filter((o) => !!o.notes?.trim()).length;
  const deliveryCount = tabOrders.filter((o) => o.deliveryType !== 'collection').length;
  const collectionCount = tabOrders.filter((o) => o.deliveryType === 'collection').length;
  const allergenCount = tabOrders.filter((o) => orderHasAllergens(o)).length;
  const cateringQuoteSentCount = tabCaterings.filter((c) => c.status === 'QUOTED').length;
  const cateringBalanceDueCount = tabCaterings.filter(
    (c) => c.status === 'DEPOSIT_PAID' || c.status === 'CONFIRMED',
  ).length;
  const cateringThisWeekCount = tabCaterings.filter((c) => {
    try {
      const t = new Date(c.eventDate).getTime();
      return t >= now && t <= now + SEVEN_DAYS_MS;
    } catch {
      return false;
    }
  }).length;

  return (
    <div className="space-y-4">
      {/* ── Summary section (mode-specific) ─────────────────────────── */}
      {typeFilter === 'all' && (
        <WorkSummaryCard
          counts={allCounts}
          currentTab={currentTab}
          onTabChange={onTabChange}
        />
      )}
      {typeFilter === 'standard' && (
        <OrderSummaryCard
          counts={standardCounts}
          currentTab={currentTab}
          onTabChange={onTabChange}
        />
      )}
      {typeFilter === 'catering' && (
        <CateringSummaryCard
          counts={cateringCounts}
          currentTab={currentTab}
          onTabChange={onTabChange}
        />
      )}

      {/* ── Today at a glance (orders, shown in all + standard) ─────── */}
      {typeFilter !== 'catering' && (
        <section className="fp-card border border-border bg-white p-4">
          <h2 className="text-sm font-bold text-dark">Today at a glance</h2>
          <dl className="mt-3 space-y-2.5">
            <StatRow Icon={ClipboardList} label="Orders today" value={String(ordersToday)} />
            <StatRow
              Icon={PoundSterling}
              label="Scheduled value"
              value={formatMoney(scheduledValuePence)}
            />
            <StatRow
              Icon={Sparkles}
              label="Avg order value"
              value={formatMoney(avgOrderValuePence)}
            />
          </dl>
        </section>
      )}

      {/* ── Catering at a glance (shown in all + catering) ──────────── */}
      {typeFilter !== 'standard' && (
        <section className="fp-card border border-border bg-white p-4">
          <h2 className="text-sm font-bold text-dark">Catering at a glance</h2>
          <dl className="mt-3 space-y-2.5">
            <StatRow
              Icon={CalendarCheck}
              label="Upcoming events"
              value={String(cateringCounts.upcomingEventsCount)}
            />
            <StatRow
              Icon={PoundSterling}
              label="Confirmed GMV"
              value={formatMoney(cateringCounts.confirmedGmvPence)}
            />
          </dl>
        </section>
      )}

      {/* ── Quick filters ─────────────────────────────────────────────── */}
      <section className="fp-card border border-border bg-white p-4">
        <h2 className="text-sm font-bold text-dark">Quick filters</h2>
        <ul className="mt-3 space-y-0.5">
          <FilterRow
            Icon={Users}
            label="All in this tab"
            count={totalTabCount}
            active={quickFilter === 'all'}
            onClick={() => onQuickFilterChange('all')}
          />

          {/* Standard order filters - visible in all + standard modes */}
          {typeFilter !== 'catering' && (
            <>
              <FilterRow
                Icon={PoundSterling}
                label="High value (over £150)"
                count={highValueCount}
                active={quickFilter === 'high_value'}
                onClick={() => onQuickFilterChange('high_value')}
              />
              <FilterRow
                Icon={StickyNote}
                label="With customer notes"
                count={hasNotesCount}
                active={quickFilter === 'has_notes'}
                onClick={() => onQuickFilterChange('has_notes')}
              />
              <FilterRow
                Icon={Truck}
                label="Delivery"
                count={deliveryCount}
                active={quickFilter === 'delivery'}
                onClick={() => onQuickFilterChange('delivery')}
              />
              <FilterRow
                Icon={ShoppingBag}
                label="Collection"
                count={collectionCount}
                active={quickFilter === 'collection'}
                onClick={() => onQuickFilterChange('collection')}
              />
              <FilterRow
                Icon={ShieldAlert}
                label="Contains allergens"
                count={allergenCount}
                active={quickFilter === 'has_allergens'}
                onClick={() => onQuickFilterChange('has_allergens')}
              />
            </>
          )}

          {/* Catering filters - visible in all + catering modes */}
          {typeFilter !== 'standard' && (
            <>
              <FilterRow
                Icon={Bike}
                label="Quote sent"
                count={cateringQuoteSentCount}
                active={quickFilter === 'catering_quote_sent'}
                onClick={() => onQuickFilterChange('catering_quote_sent')}
              />
              <FilterRow
                Icon={PoundSterling}
                label="Balance outstanding"
                count={cateringBalanceDueCount}
                active={quickFilter === 'catering_balance_due'}
                onClick={() => onQuickFilterChange('catering_balance_due')}
              />
              <FilterRow
                Icon={CalendarDays}
                label="Event this week"
                count={cateringThisWeekCount}
                active={quickFilter === 'catering_this_week'}
                onClick={() => onQuickFilterChange('catering_this_week')}
              />
            </>
          )}
        </ul>
      </section>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

const ALL_DOT: Record<string, string> = {
  needs_action: 'bg-brand',
  in_progress: 'bg-amber-500',
  completed: 'bg-teal',
  cancelled: 'bg-gray-400',
};

function WorkSummaryCard({
  counts,
  currentTab,
  onTabChange,
}: {
  counts: AllCounts;
  currentTab: string;
  onTabChange: (tab: string) => void;
}) {
  const rows: Array<{ value: keyof AllCounts; label: string }> = [
    { value: 'needs_action', label: 'Needs action' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];
  return (
    <section className="fp-card border border-border bg-white p-4">
      <h2 className="text-sm font-bold text-dark">Work summary</h2>
      <ul className="mt-3 space-y-0.5">
        {rows.map((row) => {
          const active = currentTab === row.value;
          const count = counts[row.value];
          const isPulsing = row.value === 'needs_action' && count > 0;
          return (
            <li key={row.value}>
              <button
                type="button"
                onClick={() => onTabChange(row.value)}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-teal-light text-teal-dark'
                    : 'text-mid hover:bg-surface hover:text-dark',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      ALL_DOT[row.value] ?? 'bg-gray-400',
                      isPulsing && 'motion-safe:animate-pulse',
                    )}
                  />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="text-xs font-semibold tabular-nums">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const STANDARD_DOT: Record<string, string> = {
  pending: 'bg-brand',
  preparing: 'bg-amber-500',
  dispatched: 'bg-teal',
  delivered: 'bg-teal',
};

function OrderSummaryCard({
  counts,
  currentTab,
  onTabChange,
}: {
  counts: StandardCounts;
  currentTab: string;
  onTabChange: (tab: string) => void;
}) {
  const rows: Array<{ value: keyof StandardCounts; label: string }> = [
    { value: 'pending', label: 'Pending' },
    { value: 'preparing', label: 'Preparing' },
    { value: 'dispatched', label: 'Dispatched' },
    { value: 'delivered', label: 'Delivered' },
  ];
  return (
    <section className="fp-card border border-border bg-white p-4">
      <h2 className="text-sm font-bold text-dark">Order summary</h2>
      <ul className="mt-3 space-y-0.5">
        {rows.map((row) => {
          const active = currentTab === row.value;
          const count = counts[row.value];
          return (
            <li key={row.value}>
              <button
                type="button"
                onClick={() => onTabChange(row.value)}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-teal-light text-teal-dark'
                    : 'text-mid hover:bg-surface hover:text-dark',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={cn('h-1.5 w-1.5 rounded-full', STANDARD_DOT[row.value])}
                  />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="text-xs font-semibold tabular-nums">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const CATERING_DOT: Record<string, string> = {
  QUOTED: 'bg-yellow-500',
  DEPOSIT_PAID: 'bg-blue-500',
  CONFIRMED: 'bg-green-500',
  BALANCE_PAID: 'bg-green-700',
  COMPLETED: 'bg-teal',
  CANCELLED: 'bg-gray-400',
};

const CATERING_STATUS_LABELS: Record<string, string> = {
  QUOTED: 'Quote sent',
  DEPOSIT_PAID: 'Deposit paid',
  CONFIRMED: 'Confirmed',
  BALANCE_PAID: 'Balance paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function CateringSummaryCard({
  counts,
  currentTab,
  onTabChange,
}: {
  counts: CateringCounts;
  currentTab: string;
  onTabChange: (tab: string) => void;
}) {
  const rows = (
    ['QUOTED', 'DEPOSIT_PAID', 'CONFIRMED', 'BALANCE_PAID', 'COMPLETED', 'CANCELLED'] as const
  ).map((v) => ({ value: v, label: CATERING_STATUS_LABELS[v] ?? v }));

  return (
    <section className="fp-card border border-border bg-white p-4">
      <h2 className="text-sm font-bold text-dark">Catering summary</h2>
      <ul className="mt-3 space-y-0.5">
        {rows.map((row) => {
          const active = currentTab === row.value;
          const count = counts[row.value as keyof CateringCounts] as number;
          return (
            <li key={row.value}>
              <button
                type="button"
                onClick={() => onTabChange(row.value)}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-teal-light text-teal-dark'
                    : 'text-mid hover:bg-surface hover:text-dark',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={cn('h-1.5 w-1.5 rounded-full', CATERING_DOT[row.value])}
                  />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="text-xs font-semibold tabular-nums">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatRow({
  Icon,
  label,
  value,
}: {
  Icon: typeof PoundSterling;
  label: string;
  value: string;
}) {
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
  Icon: typeof Users;
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
          active ? 'bg-teal-light text-teal-dark' : 'text-mid hover:bg-surface hover:text-dark',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-teal' : 'text-mid')}
            aria-hidden
          />
          <span className="truncate">{label}</span>
        </span>
        <span className="text-xs font-semibold tabular-nums">{count}</span>
      </button>
    </li>
  );
}
