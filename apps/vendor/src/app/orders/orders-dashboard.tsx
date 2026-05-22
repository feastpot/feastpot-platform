'use client';

import { cn } from '@feastpot/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { OrdersSummaryRail, type QuickFilter } from '@/components/orders/orders-summary-rail';
import { OrdersTopBar } from '@/components/orders/orders-top-bar';
import { VendorOrderCard } from '@/components/orders/vendor-order-card';
import { useToast } from '@/components/ui/toaster';
import { useActiveOrders, useOrderHistory, type VendorOrder, type VendorOrderStatus } from '@/hooks/use-vendor-orders';
import { playOrderChime } from '@/lib/notify-beep';
import { createClient } from '@/lib/supabase/client';

interface Props {
  vendorId: string;
}

const TABS: { value: VendorOrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'delivered', label: 'Delivered' },
];

/**
 * Vendor orders dashboard — redesigned to match the mockup while
 * preserving the previous functional contract.
 *
 * Layout (matches the mockup):
 *   [page header — title + Export/Refresh]
 *   [search bar]
 *   [live-updates pill]
 *   [tab pills]
 *   ┌──────────────────────┬──────────────────────────────┐
 *   │ summary rail          │ active orders list           │
 *   │ (counts / stats /     │ (VendorOrderCard per item)   │
 *   │  quick filters)       │                              │
 *   └──────────────────────┴──────────────────────────────┘
 *   [smart-order-management info banner]
 *
 * The underlying data model is unchanged: a single `useActiveOrders`
 * query (pending/accepted/needs_clarification/preparing/ready/
 * dispatched) split client-side per tab, and a paginated
 * `useOrderHistory` for delivered. Realtime channel + chime/toast
 * for new orders are kept verbatim from the previous implementation.
 */
export function OrdersDashboard({ vendorId }: Props) {
  const { data: active = [], isLoading: isLoadingActive, isFetching: isFetchingActive } = useActiveOrders();
  const { data: deliveredPage, isLoading: isLoadingDelivered, isFetching: isFetchingDelivered } = useOrderHistory({
    status: 'delivered',
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<VendorOrderStatus>('pending');
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  // ── Realtime + chime ───────────────────────────────────────────────
  // Track which order ids we've already chimed for so reconnects don't spam.
  const knownIds = useRef<Set<string>>(new Set());
  // Track previous status per order so UPDATE handler can detect transitions
  // (e.g. preparing → cancelled) without trusting Supabase's `old` payload,
  // which only includes columns in the table's REPLICA IDENTITY (often just id).
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
    // Vendor switch (e.g. multi-vendor admin user) must not carry per-order
    // memory across accounts — that would suppress chimes / mis-classify
    // status transitions on the new vendor's orders.
    knownIds.current.clear();
    prevStatus.current.clear();
    setRealtimeStatus('disconnected');

    const supabase = createClient();
    const channel = supabase
      .channel(`vendor-orders-${vendorId}`)
      .on(
        // Supabase Realtime postgres_changes payload is loosely typed in
        // @supabase/supabase-js; the cast keeps the call site strict.
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
          // Prefer our own cache because REPLICA IDENTITY DEFAULT means
          // payload.old.status is usually undefined.
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
                title: `STOP — order ${orderRef} cancelled`,
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

  // ── Buckets & counts ────────────────────────────────────────────────
  const buckets = useMemo(() => {
    // Pending bucket also includes `needs_clarification` because both demand
    // vendor attention before the order moves into the kitchen.
    const pending = active.filter(
      (o) => o.status === 'pending' || o.status === 'needs_clarification',
    );
    // Folder: "accepted" rolls into the Preparing tab so the vendor sees a
    // single "in your kitchen" pile rather than splitting hairs over the
    // accepted-but-not-yet-marked-preparing edge case. `ready` belongs here
    // too: the food is done but still in your kitchen waiting on dispatch.
    const preparing = active.filter(
      (o) => o.status === 'preparing' || o.status === 'accepted' || o.status === 'ready',
    );
    const dispatched = active.filter((o) => o.status === 'dispatched');
    return { pending, preparing, dispatched };
  }, [active]);

  const delivered = useMemo(() => deliveredPage?.data ?? [], [deliveredPage]);

  const counts: Record<VendorOrderStatus, number> = {
    pending: buckets.pending.length,
    accepted: 0,
    needs_clarification: 0,
    preparing: buckets.preparing.length,
    ready: 0,
    dispatched: buckets.dispatched.length,
    delivered: delivered.length,
    cancelled: 0,
    refunded: 0,
    rejected: 0,
  };

  // ── Visible orders for the current tab + search + quick filter ─────
  const visibleOrders = useMemo(() => {
    const base =
      activeTab === 'pending'
        ? buckets.pending
        : activeTab === 'preparing'
          ? buckets.preparing
          : activeTab === 'dispatched'
            ? buckets.dispatched
            : delivered;

    const needle = search.trim().toLowerCase();
    return base.filter((o) => {
      if (needle.length > 0) {
        const hay = `${o.orderNumber} ${o.customer?.name ?? ''} ${o.customer?.firstName ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (quickFilter === 'high_value' && o.totalPence < 15000) return false;
      if (quickFilter === 'has_notes' && !(o.notes && o.notes.trim().length > 0)) return false;
      return true;
    });
  }, [activeTab, buckets, delivered, search, quickFilter]);

  const isLoading =
    activeTab === 'delivered' ? isLoadingDelivered : isLoadingActive;
  const isFetching =
    activeTab === 'delivered' ? isFetchingDelivered : isFetchingActive;

  // ── Actions ─────────────────────────────────────────────────────────
  const onRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['vendor', 'orders'] });
    void qc.invalidateQueries({ queryKey: ['vendor', 'stats'] });
    toast({ title: 'Orders refreshed' });
  }, [qc, toast]);

  const onExport = useCallback(() => {
    if (visibleOrders.length === 0) {
      toast({ title: 'Nothing to export', description: 'No orders match your current view.' });
      return;
    }
    const csv = ordersToCsv(visibleOrders);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feastpot-orders-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [visibleOrders, activeTab, toast]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">Orders</h1>
        <p className="mt-1 text-sm text-mid">
          Accept, prepare, dispatch and review every order from one place.
        </p>
      </header>

      <OrdersTopBar
        search={search}
        onSearchChange={setSearch}
        onExport={onExport}
        onRefresh={onRefresh}
        isRefreshing={isFetching}
      />

      <div className="flex items-center gap-1.5 text-[11px] text-mid">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            realtimeStatus === 'connected' ? 'bg-teal' : 'bg-red-500',
          )}
          aria-hidden
        />
        <span>
          {realtimeStatus === 'connected'
            ? 'Live updates'
            : 'Offline — refresh to update'}
        </span>
      </div>

      <div aria-label="Order status" className="flex items-center gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const count = counts[t.value];
          const isActive = activeTab === t.value;
          const isPendingWithCount = t.value === 'pending' && count > 0;
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveTab(t.value)}
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
                    : isPendingWithCount
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="Order summary and filters">
          <OrdersSummaryRail
            counts={counts}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabOrders={
              activeTab === 'delivered'
                ? delivered
                : activeTab === 'preparing'
                  ? buckets.preparing
                  : activeTab === 'dispatched'
                    ? buckets.dispatched
                    : buckets.pending
            }
            quickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
          />
        </aside>

        <section aria-label={`${activeTab} orders`} className="min-w-0">
          <BucketList
            orders={visibleOrders}
            isLoading={isLoading}
            tab={activeTab}
            hasAnyActive={activeTab === 'delivered' ? delivered.length > 0 : (buckets[activeTab as 'pending' | 'preparing' | 'dispatched']?.length ?? 0) > 0}
            search={search}
            quickFilter={quickFilter}
          />
        </section>
      </div>

      <div className="fp-card flex items-start gap-3 border border-border bg-white p-4">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-light text-teal">
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

function BucketList({
  orders,
  isLoading,
  tab,
  hasAnyActive,
  search,
  quickFilter,
}: {
  orders: VendorOrder[];
  isLoading: boolean;
  tab: VendorOrderStatus;
  hasAnyActive: boolean;
  search: string;
  quickFilter: QuickFilter;
}) {
  if (isLoading) {
    return <div className="fp-card border border-border bg-white p-6 text-center text-sm text-mid">Loading orders…</div>;
  }

  if (!orders || orders.length === 0) {
    const filteredOut = hasAnyActive && (search.length > 0 || quickFilter !== 'all');
    return (
      <div className="fp-card border border-border bg-white p-10 text-center">
        <p className="text-base font-semibold text-dark">
          {filteredOut ? 'No matching orders' : emptyTitleFor(tab)}
        </p>
        <p className="mt-1 text-xs text-mid">
          {filteredOut
            ? 'Try clearing the search or quick filter on the left.'
            : emptyHintFor(tab)}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {orders.map((o) => (
        <VendorOrderCard key={o.id} order={o} />
      ))}
    </div>
  );
}

function emptyTitleFor(tab: VendorOrderStatus): string {
  switch (tab) {
    case 'pending':
      return 'No pending orders';
    case 'preparing':
      return 'Nothing being prepared right now';
    case 'dispatched':
      return 'Nothing out for delivery';
    case 'delivered':
      return 'No delivered orders yet';
    default:
      return 'No orders';
  }
}

function emptyHintFor(tab: VendorOrderStatus): string {
  switch (tab) {
    case 'pending':
      return 'New orders will appear here automatically — and the kitchen will chime.';
    case 'preparing':
      return 'Accept a pending order to move it here.';
    case 'dispatched':
      return "Mark an order as dispatched once it's en route.";
    case 'delivered':
      return 'Completed orders show up here for easy reference.';
    default:
      return '';
  }
}

/**
 * Minimal client-side CSV export for the currently-visible orders.
 * Fields are limited to what `VendorOrder` reliably exposes; the more
 * detail-heavy reports (line items, payouts breakdown) belong on the
 * server-side /payouts export.
 */
function ordersToCsv(orders: VendorOrder[]): string {
  const header = ['order_number', 'status', 'customer', 'scheduled_for', 'total_gbp', 'payout_gbp', 'notes'];
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
  // Defuse spreadsheet formula injection: Excel/Sheets/Numbers evaluate any
  // cell whose first character is one of these as a formula, which can leak
  // data via WEBSERVICE/HYPERLINK. Prefix a single quote (per OWASP guidance)
  // so the value renders literally.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
