'use client';

import { cn } from '@feastpot/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CateringBookingCard } from '@/components/orders/catering-booking-card';
import {
  OrdersSummaryRail,
  orderHasAllergens,
  type AllCounts,
  type CateringCounts,
  type QuickFilter,
  type StandardCounts,
  type TypeFilter,
} from '@/components/orders/orders-summary-rail';
import { OrdersTopBar } from '@/components/orders/orders-top-bar';
import { VendorOrderCard } from '@/components/orders/vendor-order-card';
import { useToast } from '@/components/ui/toaster';
import { useActiveCateringBookings } from '@/hooks/use-catering-bookings';
import {
  useActiveOrders,
  useCancelledOrders,
  useOrderHistory,
  type VendorOrder,
  type VendorOrderStatus,
} from '@/hooks/use-vendor-orders';
import type { CateringBooking, CateringBookingStatus } from '@/lib/api/catering-bookings';
import { playOrderChime } from '@/lib/notify-beep';
import { createClient } from '@/lib/supabase/client';

// Re-export TypeFilter so the server page can import it from one place.
export type { TypeFilter };

// ── Work item: the unified list entry for both orders and catering ────────

type WorkItem = { kind: 'order'; data: VendorOrder } | { kind: 'catering'; data: CateringBooking };

type UnifiedStatus = 'needs_action' | 'in_progress' | 'completed' | 'cancelled';

// ── Tab definitions ────────────────────────────────────────────────────────

const ALL_TABS: { value: UnifiedStatus; label: string }[] = [
  { value: 'needs_action', label: 'Needs action' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STANDARD_TABS: { value: VendorOrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'delivered', label: 'Delivered' },
];

const CATERING_TABS: { value: CateringBookingStatus; label: string }[] = [
  { value: 'QUOTED', label: 'Quote sent' },
  { value: 'DEPOSIT_PAID', label: 'Deposit paid' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'BALANCE_PAID', label: 'Balance paid' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

// ── Unified status mapping (explicit comment required by brief) ────────────
//
// Orders:
//   pending | needs_clarification              -> needs_action
//   accepted | preparing | ready | dispatched  -> in_progress
//   delivered                                  -> completed
//   cancelled | rejected | refunded            -> cancelled
//
// Catering bookings:
//   QUOTED                                     -> needs_action
//   DEPOSIT_PAID | CONFIRMED | BALANCE_PAID    -> in_progress
//   COMPLETED                                  -> completed
//   CANCELLED | EXPIRED                        -> cancelled

function orderUnifiedStatus(status: VendorOrderStatus): UnifiedStatus {
  switch (status) {
    case 'pending':
    case 'needs_clarification':
      return 'needs_action';
    case 'accepted':
    case 'preparing':
    case 'ready':
    case 'dispatched':
      return 'in_progress';
    case 'delivered':
      return 'completed';
    default:
      return 'cancelled';
  }
}

function cateringUnifiedStatus(status: CateringBookingStatus): UnifiedStatus {
  switch (status) {
    case 'ASSIGNED': // Routed to us by admin - fill in a quote
    case 'QUOTED':
      return 'needs_action';
    case 'DEPOSIT_PAID':
    case 'CONFIRMED':
    case 'BALANCE_PAID':
      return 'in_progress';
    case 'COMPLETED':
      return 'completed';
    default: // CANCELLED | EXPIRED
      return 'cancelled';
  }
}

// ── Sort helpers ───────────────────────────────────────────────────────────

/**
 * Sort key for needs_action and in_progress buckets: ascending by soonest
 * commitment date. Items with no scheduled date sort last (Infinity).
 */
function activeCommitmentMs(item: WorkItem): number {
  if (item.kind === 'order') {
    return item.data.scheduledFor ? new Date(item.data.scheduledFor).getTime() : Infinity;
  }
  try {
    const t = new Date(item.data.eventDate).getTime();
    return isNaN(t) ? Infinity : t;
  } catch {
    return Infinity;
  }
}

function completedMs(item: WorkItem): number {
  if (item.kind === 'order') {
    return new Date(item.data.deliveredAt ?? item.data.createdAt).getTime();
  }
  return new Date(item.data.completedAt ?? item.data.createdAt).getTime();
}

function cancelledMs(item: WorkItem): number {
  if (item.kind === 'order') {
    return new Date(item.data.cancelledAt ?? item.data.createdAt).getTime();
  }
  return new Date(item.data.cancelledAt ?? item.data.createdAt).getTime();
}

// ── Bucket computation ─────────────────────────────────────────────────────

type AllBuckets = Record<UnifiedStatus, WorkItem[]>;

function computeAllBuckets(
  active: VendorOrder[],
  delivered: VendorOrder[],
  cancelled: VendorOrder[],
  caterings: CateringBooking[],
): AllBuckets {
  const buckets: AllBuckets = {
    needs_action: [],
    in_progress: [],
    completed: [],
    cancelled: [],
  };

  for (const o of active) {
    buckets[orderUnifiedStatus(o.status)].push({ kind: 'order', data: o });
  }
  for (const o of delivered) {
    buckets.completed.push({ kind: 'order', data: o });
  }
  for (const o of cancelled) {
    buckets.cancelled.push({ kind: 'order', data: o });
  }
  for (const c of caterings) {
    buckets[cateringUnifiedStatus(c.status)].push({ kind: 'catering', data: c });
  }

  // Sort: active buckets ascending by soonest commitment; resolved buckets newest first.
  buckets.needs_action.sort((a, b) => activeCommitmentMs(a) - activeCommitmentMs(b));
  buckets.in_progress.sort((a, b) => activeCommitmentMs(a) - activeCommitmentMs(b));
  buckets.completed.sort((a, b) => completedMs(b) - completedMs(a));
  buckets.cancelled.sort((a, b) => cancelledMs(b) - cancelledMs(a));

  return buckets;
}

type StandardBuckets = {
  pending: WorkItem[];
  preparing: WorkItem[];
  dispatched: WorkItem[];
  delivered: WorkItem[];
};

function computeStandardBuckets(active: VendorOrder[], delivered: VendorOrder[]): StandardBuckets {
  return {
    pending: active
      .filter((o) => o.status === 'pending' || o.status === 'needs_clarification')
      .map((o) => ({ kind: 'order', data: o })),
    preparing: active
      .filter((o) => o.status === 'preparing' || o.status === 'accepted' || o.status === 'ready')
      .map((o) => ({ kind: 'order', data: o })),
    dispatched: active
      .filter((o) => o.status === 'dispatched')
      .map((o) => ({ kind: 'order', data: o })),
    delivered: delivered.map((o) => ({ kind: 'order', data: o })),
  };
}

type CateringBuckets = Partial<Record<CateringBookingStatus, WorkItem[]>>;

function computeCateringBuckets(caterings: CateringBooking[]): CateringBuckets {
  const result: CateringBuckets = {};
  for (const c of caterings) {
    const key = c.status === 'EXPIRED' ? 'CANCELLED' : c.status;
    if (!result[key]) result[key] = [];
    result[key]!.push({ kind: 'catering', data: c });
  }
  for (const items of Object.values(result)) {
    items.sort((a, b) => activeCommitmentMs(a) - activeCommitmentMs(b));
  }
  return result;
}

// ── Filter ────────────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function filterItems(items: WorkItem[], search: string, quickFilter: QuickFilter): WorkItem[] {
  const needle = search.trim().toLowerCase();
  return items.filter((item) => {
    // Search
    if (needle.length > 0) {
      if (item.kind === 'order') {
        const hay =
          `${item.data.orderNumber} ${item.data.customer?.name ?? ''} ${item.data.customer?.firstName ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      } else {
        const hay = `${item.data.customerName} ${item.data.customerEmail}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
    }

    // Quick filter
    switch (quickFilter) {
      case 'all':
        return true;
      case 'high_value':
        return item.kind === 'order' && item.data.totalPence >= 15000;
      case 'has_notes':
        return item.kind === 'order' && !!item.data.notes?.trim();
      case 'delivery':
        return item.kind === 'order' && item.data.deliveryType !== 'collection';
      case 'collection':
        return item.kind === 'order' && item.data.deliveryType === 'collection';
      case 'has_allergens':
        return item.kind === 'order' && orderHasAllergens(item.data);
      case 'catering_quote_sent':
        return item.kind === 'catering' && item.data.status === 'QUOTED';
      case 'catering_balance_due':
        return (
          item.kind === 'catering' &&
          (item.data.status === 'DEPOSIT_PAID' || item.data.status === 'CONFIRMED')
        );
      case 'catering_this_week': {
        if (item.kind !== 'catering') return false;
        try {
          const t = new Date(item.data.eventDate).getTime();
          const now = Date.now();
          return t >= now && t <= now + SEVEN_DAYS_MS;
        } catch {
          return false;
        }
      }
      default:
        return true;
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultTabFor(type: TypeFilter): string {
  if (type === 'standard') return 'pending';
  if (type === 'catering') return 'QUOTED';
  return 'needs_action';
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  vendorId: string;
  initialType?: TypeFilter;
}

export function OrdersDashboard({ vendorId, initialType = 'all' }: Props) {
  // ── Data ─────────────────────────────────────────────────────────────
  const {
    data: active = [],
    isLoading: isLoadingActive,
    isFetching: isFetchingActive,
    isError: isErrorActive,
  } = useActiveOrders();

  const {
    data: deliveredPage,
    isLoading: isLoadingDelivered,
    isFetching: isFetchingDelivered,
    isError: isErrorDelivered,
  } = useOrderHistory({ status: 'delivered' });

  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType);

  const { data: cancelledOrders = [], isLoading: isLoadingCancelled } = useCancelledOrders(
    typeFilter === 'all',
  );

  const {
    data: cateringBookings = [],
    isLoading: isLoadingCatering,
    isFetching: isFetchingCatering,
    isError: isErrorCatering,
  } = useActiveCateringBookings();

  const qc = useQueryClient();
  const { toast } = useToast();

  // ── State ─────────────────────────────────────────────────────────────
  const [statusTab, setStatusTab] = useState<string>(() => defaultTabFor(initialType));
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  // Reset status tab and quick filter whenever the type filter changes.
  useEffect(() => {
    setStatusTab(defaultTabFor(typeFilter));
    setQuickFilter('all');
  }, [typeFilter]);

  // ── Realtime + chime (orders only) ───────────────────────────────────
  const knownIds = useRef<Set<string>>(new Set());
  const prevStatus = useRef<Map<string, string>>(new Map());
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'disconnected'>(
    'disconnected',
  );

  useEffect(() => {
    for (const o of active) {
      knownIds.current.add(o.id);
      prevStatus.current.set(o.id, o.status);
    }
  }, [active]);

  useEffect(() => {
    knownIds.current.clear();
    prevStatus.current.clear();
    setRealtimeStatus('disconnected');

    const supabase = createClient();
    const channel = supabase
      .channel(`vendor-orders-${vendorId}`)
      .on(
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `vendor_id=eq.${vendorId}`,
        },
        (payload: { new?: { id?: string; order_number?: string; status?: string } }) => {
          const id = payload.new?.id;
          if (id && knownIds.current.has(id)) return;
          if (id) {
            knownIds.current.add(id);
            if (payload.new?.status) prevStatus.current.set(id, payload.new.status);
          }
          playOrderChime();
          toast({
            title: 'New order received',
            description: payload.new?.order_number
              ? `Order ${payload.new.order_number}`
              : 'A new order just landed',
          });
          qc.invalidateQueries({ queryKey: ['vendor', 'orders'] });
          qc.invalidateQueries({ queryKey: ['vendor', 'stats'] });
        },
      )
      .on(
        'postgres_changes' as never,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `vendor_id=eq.${vendorId}`,
        },
        (payload: {
          new?: { id?: string; order_number?: string; status?: string };
          old?: { status?: string };
        }) => {
          const id = payload.new?.id;
          const newStatus = payload.new?.status;
          if (!id || !newStatus) return;
          const oldStatus = prevStatus.current.get(id) ?? payload.old?.status;
          prevStatus.current.set(id, newStatus);
          if (oldStatus === newStatus) return;

          qc.invalidateQueries({ queryKey: ['vendor', 'orders'] });
          qc.invalidateQueries({ queryKey: ['vendor', 'stats'] });

          const orderRef = payload.new?.order_number ?? `#${id.slice(-6)}`;
          if (newStatus === 'cancelled') {
            if (oldStatus === 'preparing' || oldStatus === 'accepted') {
              toast({
                variant: 'destructive',
                title: `STOP: order ${orderRef} cancelled`,
                description:
                  'This order was cancelled while you were preparing it. Halt prep and check the order details.',
              });
            } else {
              toast({
                variant: 'destructive',
                title: `Order ${orderRef} cancelled`,
                description: 'The customer cancelled this order.',
              });
            }
          }
        },
      )
      .subscribe((status) => {
        setRealtimeStatus(status === 'SUBSCRIBED' ? 'connected' : 'disconnected');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [vendorId, qc, toast]);

  // ── Buckets ────────────────────────────────────────────────────────────
  const delivered = useMemo(() => deliveredPage?.data ?? [], [deliveredPage]);

  const allBuckets = useMemo(
    () => computeAllBuckets(active, delivered, cancelledOrders, cateringBookings),
    [active, delivered, cancelledOrders, cateringBookings],
  );

  const standardBuckets = useMemo(
    () => computeStandardBuckets(active, delivered),
    [active, delivered],
  );

  const cateringByStatus = useMemo(
    () => computeCateringBuckets(cateringBookings),
    [cateringBookings],
  );

  // ── Pre-computed counts for tab pills + summary rail ─────────────────
  const allCounts: AllCounts = useMemo(
    () => ({
      needs_action: allBuckets.needs_action.length,
      in_progress: allBuckets.in_progress.length,
      completed: allBuckets.completed.length,
      cancelled: allBuckets.cancelled.length,
    }),
    [allBuckets],
  );

  const standardCounts: StandardCounts = useMemo(
    () => ({
      pending: standardBuckets.pending.length,
      preparing: standardBuckets.preparing.length,
      dispatched: standardBuckets.dispatched.length,
      delivered: standardBuckets.delivered.length,
    }),
    [standardBuckets],
  );

  const cateringCounts: CateringCounts = useMemo(() => {
    const upcoming = cateringBookings.filter(
      (b) =>
        ['QUOTED', 'DEPOSIT_PAID', 'CONFIRMED', 'BALANCE_PAID'].includes(b.status) &&
        new Date(b.eventDate) > new Date(),
    ).length;
    const confirmedGmv = cateringBookings
      .filter((b) => ['CONFIRMED', 'BALANCE_PAID', 'COMPLETED'].includes(b.status))
      .reduce((s, b) => s + b.totalPence, 0);
    return {
      QUOTED: cateringByStatus.QUOTED?.length ?? 0,
      DEPOSIT_PAID: cateringByStatus.DEPOSIT_PAID?.length ?? 0,
      CONFIRMED: cateringByStatus.CONFIRMED?.length ?? 0,
      BALANCE_PAID: cateringByStatus.BALANCE_PAID?.length ?? 0,
      COMPLETED: cateringByStatus.COMPLETED?.length ?? 0,
      CANCELLED: cateringByStatus.CANCELLED?.length ?? 0,
      upcomingEventsCount: upcoming,
      confirmedGmvPence: confirmedGmv,
    };
  }, [cateringBookings, cateringByStatus]);

  // ── Current tab items ─────────────────────────────────────────────────
  const currentTabItems = useMemo((): WorkItem[] => {
    if (typeFilter === 'all') {
      return allBuckets[statusTab as UnifiedStatus] ?? [];
    }
    if (typeFilter === 'standard') {
      return standardBuckets[statusTab as keyof StandardBuckets] ?? [];
    }
    return cateringByStatus[statusTab as CateringBookingStatus] ?? [];
  }, [typeFilter, statusTab, allBuckets, standardBuckets, cateringByStatus]);

  const visibleItems = useMemo(
    () => filterItems(currentTabItems, search, quickFilter),
    [currentTabItems, search, quickFilter],
  );

  // Items split by kind for the summary rail's quick-filter count computation.
  const tabOrders = useMemo(
    () =>
      visibleItems
        .filter((i): i is { kind: 'order'; data: VendorOrder } => i.kind === 'order')
        .map((i) => i.data),
    [visibleItems],
  );
  const tabCaterings = useMemo(
    () =>
      visibleItems
        .filter((i): i is { kind: 'catering'; data: CateringBooking } => i.kind === 'catering')
        .map((i) => i.data),
    [visibleItems],
  );

  // ── Counts for the tab pill row ───────────────────────────────────────
  const tabCounts = useMemo((): Record<string, number> => {
    if (typeFilter === 'all') {
      return {
        needs_action: allCounts.needs_action,
        in_progress: allCounts.in_progress,
        completed: allCounts.completed,
        cancelled: allCounts.cancelled,
      };
    }
    if (typeFilter === 'standard') {
      return {
        pending: standardCounts.pending,
        preparing: standardCounts.preparing,
        dispatched: standardCounts.dispatched,
        delivered: standardCounts.delivered,
      };
    }
    const cc: Record<string, number> = {};
    for (const t of CATERING_TABS) cc[t.value] = cateringByStatus[t.value]?.length ?? 0;
    return cc;
  }, [typeFilter, allCounts, standardCounts, cateringByStatus]);

  // ── Loading / error state ─────────────────────────────────────────────
  const isLoading = useMemo(() => {
    if (typeFilter === 'catering') return isLoadingCatering;
    if (typeFilter === 'standard') {
      return statusTab === 'delivered' ? isLoadingDelivered : isLoadingActive;
    }
    // all
    return (
      isLoadingActive || isLoadingCatering || (statusTab === 'cancelled' && isLoadingCancelled)
    );
  }, [
    typeFilter,
    statusTab,
    isLoadingActive,
    isLoadingDelivered,
    isLoadingCatering,
    isLoadingCancelled,
  ]);

  const isFetching = isFetchingActive || isFetchingCatering || isFetchingDelivered;

  const isError = useMemo(() => {
    if (typeFilter === 'catering') return isErrorCatering;
    if (typeFilter === 'standard') {
      return statusTab === 'delivered' ? isErrorDelivered : isErrorActive;
    }
    return isErrorActive || isErrorCatering;
  }, [typeFilter, statusTab, isErrorActive, isErrorDelivered, isErrorCatering]);

  // ── Actions ────────────────────────────────────────────────────────────
  const onRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['vendor', 'orders'] });
    void qc.invalidateQueries({ queryKey: ['vendor', 'catering-bookings'] });
    void qc.invalidateQueries({ queryKey: ['vendor', 'stats'] });
    toast({ title: 'Orders refreshed' });
  }, [qc, toast]);

  const onExport = useCallback(() => {
    const orders = visibleItems
      .filter((i): i is { kind: 'order'; data: VendorOrder } => i.kind === 'order')
      .map((i) => i.data);
    if (orders.length === 0) {
      toast({ title: 'Nothing to export', description: 'No orders match your current view.' });
      return;
    }
    const csv = ordersToCsv(orders);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feastpot-orders-${statusTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [visibleItems, statusTab, toast]);

  // ── Active tab list ───────────────────────────────────────────────────
  const tabs =
    typeFilter === 'standard'
      ? STANDARD_TABS
      : typeFilter === 'catering'
        ? CATERING_TABS
        : ALL_TABS;

  const showCateringAction = typeFilter !== 'standard';

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-dark">Orders</h1>
          <p className="mt-1 text-sm text-mid">
            Accept, prepare and manage every standard order and catering booking from one place.
          </p>
        </div>
        {showCateringAction && (
          <Link
            href="/catering/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New catering quote
          </Link>
        )}
      </header>

      {/* ── Type filter ─────────────────────────────────────────────── */}
      <div aria-label="Work type" className="flex items-center gap-2">
        {(
          [
            { value: 'all', label: 'All work' },
            { value: 'standard', label: 'Standard orders' },
            { value: 'catering', label: 'Catering' },
          ] as { value: TypeFilter; label: string }[]
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={typeFilter === opt.value}
            onClick={() => setTypeFilter(opt.value)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors',
              typeFilter === opt.value
                ? 'border-teal bg-teal text-white'
                : 'border-border bg-white text-mid hover:bg-surface hover:text-dark',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Search + export/refresh ──────────────────────────────────── */}
      <OrdersTopBar
        search={search}
        onSearchChange={setSearch}
        onExport={typeFilter === 'standard' ? onExport : undefined}
        onRefresh={onRefresh}
        isRefreshing={isFetching}
      />

      {/* ── Live updates indicator ───────────────────────────────────── */}
      <div className="flex items-center gap-1.5 text-[11px] text-mid">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            realtimeStatus === 'connected' ? 'bg-teal' : 'bg-red-500',
          )}
          aria-hidden
        />
        <span>
          {realtimeStatus === 'connected' ? 'Live updates' : 'Offline - refresh to update'}
        </span>
      </div>

      {/* ── Status tab pills ─────────────────────────────────────────── */}
      <div aria-label="Status filter" className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const count = tabCounts[t.value] ?? 0;
          const isActive = statusTab === t.value;
          const isPulsing =
            (t.value === 'needs_action' || t.value === 'pending' || t.value === 'QUOTED') &&
            count > 0;
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setStatusTab(t.value)}
              className={cn(
                'inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors',
                isActive
                  ? 'border-teal bg-teal text-white shadow-sm'
                  : 'border-border bg-white text-mid hover:bg-surface hover:text-dark',
              )}
            >
              <span>{t.label}</span>
              <span
                className={cn(
                  'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                  isActive
                    ? 'bg-white/20 text-white'
                    : isPulsing
                      ? 'bg-brand text-white motion-safe:animate-pulse'
                      : 'bg-surface text-dark',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Summary rail + list ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="Summary and filters">
          <OrdersSummaryRail
            typeFilter={typeFilter}
            allCounts={allCounts}
            standardCounts={standardCounts}
            cateringCounts={cateringCounts}
            currentTab={statusTab}
            onTabChange={setStatusTab}
            tabOrders={tabOrders}
            tabCaterings={tabCaterings}
            quickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
          />
        </aside>

        <section aria-label={`${statusTab} work`} className="min-w-0">
          <WorkItemList
            items={visibleItems}
            isLoading={isLoading}
            isError={isError}
            typeFilter={typeFilter}
            statusTab={statusTab}
            hasAnyItems={currentTabItems.length > 0}
            search={search}
            quickFilter={quickFilter}
          />
        </section>
      </div>

      {/* ── Smart order management banner ───────────────────────────── */}
      <div className="fp-card flex items-start gap-3 border border-border bg-white p-4">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-light text-teal"
        >
          <Bell className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-dark">Smart order management</p>
          <p className="mt-0.5 text-xs text-mid">
            Accept orders promptly to improve your response time and customer experience.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── List renderer ──────────────────────────────────────────────────────────

function WorkItemList({
  items,
  isLoading,
  isError,
  typeFilter,
  statusTab,
  hasAnyItems,
  search,
  quickFilter,
}: {
  items: WorkItem[];
  isLoading: boolean;
  isError: boolean;
  typeFilter: TypeFilter;
  statusTab: string;
  hasAnyItems: boolean;
  search: string;
  quickFilter: QuickFilter;
}) {
  if (isLoading) {
    return (
      <div className="fp-card border border-border bg-white p-6 text-center text-sm text-mid">
        Loading...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="fp-card border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
        Could not load orders. Please refresh to try again.
      </div>
    );
  }

  if (items.length === 0) {
    const filteredOut = hasAnyItems && (search.length > 0 || quickFilter !== 'all');
    if (filteredOut) {
      return (
        <div className="fp-card border border-border bg-white p-10 text-center">
          <p className="text-base font-semibold text-dark">No matching results</p>
          <p className="mt-1 text-xs text-mid">
            Try clearing the search or quick filter on the left.
          </p>
        </div>
      );
    }
    return <EmptyState typeFilter={typeFilter} statusTab={statusTab} />;
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {items.map((item) =>
        item.kind === 'order' ? (
          <VendorOrderCard key={item.data.id} order={item.data} />
        ) : (
          <CateringBookingCard key={item.data.id} booking={item.data} />
        ),
      )}
    </div>
  );
}

function EmptyState({ typeFilter, statusTab }: { typeFilter: TypeFilter; statusTab: string }) {
  // Catering-specific empty state with actionable copy (replaces the old
  // "When admin routes a catering enquiry to you, create a quote here" message).
  const showCateringEmpty =
    typeFilter === 'catering' ||
    statusTab === 'QUOTED' ||
    (typeFilter === 'all' && statusTab === 'needs_action');

  if (showCateringEmpty) {
    return (
      <div className="fp-card border border-dashed border-border bg-white p-10 text-center">
        <p className="text-base font-semibold text-dark">No catering bookings yet</p>
        <p className="mt-2 text-sm text-mid">
          Feastpot routes catering enquiries to you based on your location and cuisine. You can also
          create a quote directly for a customer who contacted you outside the platform.
        </p>
        <Link
          href="/catering/new"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Create a quote
        </Link>
      </div>
    );
  }

  const title = emptyTitleFor(statusTab);
  const hint = emptyHintFor(typeFilter, statusTab);
  return (
    <div className="fp-card border border-border bg-white p-10 text-center">
      <p className="text-base font-semibold text-dark">{title}</p>
      {hint && <p className="mt-1 text-xs text-mid">{hint}</p>}
    </div>
  );
}

function emptyTitleFor(tab: string): string {
  switch (tab) {
    case 'needs_action':
      return 'Nothing needs your attention right now';
    case 'in_progress':
      return 'No work in progress';
    case 'completed':
      return 'No completed work yet';
    case 'cancelled':
      return 'No cancelled bookings';
    case 'pending':
      return 'No pending orders';
    case 'preparing':
      return 'Nothing being prepared right now';
    case 'dispatched':
      return 'Nothing out for delivery';
    case 'delivered':
      return 'No delivered orders yet';
    case 'QUOTED':
      return 'No quotes sent yet';
    case 'DEPOSIT_PAID':
      return 'No deposits received yet';
    case 'CONFIRMED':
      return 'No confirmed bookings';
    case 'BALANCE_PAID':
      return 'No balances collected yet';
    case 'COMPLETED':
      return 'No completed catering jobs yet';
    case 'CANCELLED':
      return 'No cancelled catering bookings';
    default:
      return 'Nothing here yet';
  }
}

function emptyHintFor(typeFilter: TypeFilter, tab: string): string {
  switch (tab) {
    case 'needs_action':
      return "You're all caught up. New orders and catering quotes will appear here automatically.";
    case 'in_progress':
      return 'Accept a pending order or confirm a catering deposit to move work here.';
    case 'pending':
      return 'New orders will appear here automatically, and the kitchen will chime.';
    case 'preparing':
      return 'Accept a pending order to move it here.';
    case 'dispatched':
      return "Mark an order as dispatched once it's en route.";
    case 'delivered':
      return 'Completed orders show up here for easy reference.';
    case 'QUOTED':
      return typeFilter === 'all'
        ? 'Catering enquiries routed to you by Feastpot appear here once you send a quote.'
        : 'Feastpot routes catering enquiries to you based on your location and cuisine. You can also create a quote directly.';
    default:
      return '';
  }
}

// ── CSV export (orders only) ───────────────────────────────────────────────

function ordersToCsv(orders: VendorOrder[]): string {
  const header = [
    'order_number',
    'status',
    'customer',
    'scheduled_for',
    'total_gbp',
    'payout_gbp',
    'notes',
  ];
  const rows = orders.map((o) => [
    o.orderNumber,
    o.status,
    o.customer?.name ?? o.customer?.firstName ?? '',
    o.scheduledFor ?? '',
    (o.totalPence / 100).toFixed(2),
    (o.vendorPayoutPence / 100).toFixed(2),
    (o.notes ?? '').replace(/\r?\n/g, ' '),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(v: string | number): string {
  let s = String(v);
  // Defuse spreadsheet formula injection: prefix injection characters with a
  // single quote so the value renders literally in Excel/Sheets/Numbers.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
