'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@feastpot/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { VendorOrderCard } from '@/components/orders/vendor-order-card';
import { useToast } from '@/components/ui/toaster';
import { useActiveOrders, useOrderHistory, type VendorOrderStatus } from '@/hooks/use-vendor-orders';
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
 * Order kanban — one tab per workflow stage.
 *
 * Active orders (pending/accepted/preparing/dispatched) come from a single
 * `useActiveOrders` query so the realtime channel only needs to invalidate
 * one cache key. We split them client-side per tab. The "accepted" status
 * is folded into the "Preparing" tab because the API distinguishes it but
 * it's not a separate visible state in the brief.
 *
 * The Delivered tab uses the cursor-paginated history endpoint; we render
 * just the first page since this is the kanban surface (the full history
 * lives on /payouts and a future /orders/history page).
 */
export function OrdersDashboard({ vendorId }: Props) {
  const { data: active = [], isLoading: isLoadingActive } = useActiveOrders();
  const { data: deliveredPage, isLoading: isLoadingDelivered } = useOrderHistory({
    status: 'delivered',
  });
  const qc = useQueryClient();
  const { toast } = useToast();
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

  const buckets = useMemo(() => {
    const pending = active.filter((o) => o.status === 'pending');
    // Folder: "accepted" rolls into the Preparing tab so the vendor sees a
    // single "in your kitchen" pile rather than splitting hairs over the
    // accepted-but-not-yet-marked-preparing edge case.
    const preparing = active.filter(
      (o) => o.status === 'preparing' || o.status === 'accepted',
    );
    const dispatched = active.filter((o) => o.status === 'dispatched');
    return { pending, preparing, dispatched };
  }, [active]);

  const delivered = deliveredPage?.data ?? [];

  const counts: Record<VendorOrderStatus, number> = {
    pending: buckets.pending.length,
    accepted: 0,
    preparing: buckets.preparing.length,
    dispatched: buckets.dispatched.length,
    delivered: delivered.length,
    cancelled: 0,
    refunded: 0,
    rejected: 0,
  };

  return (
    <Tabs defaultValue="pending" className="space-y-4">
      <div className="flex items-center gap-1.5 text-[11px] text-mid">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            realtimeStatus === 'connected' ? 'bg-emerald-600' : 'bg-red-500',
          )}
          aria-hidden
        />
        <span>
          {realtimeStatus === 'connected'
            ? 'Live updates'
            : 'Offline — refresh to update'}
        </span>
      </div>
      <TabsList className="w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
        {TABS.map((t) => {
          const count = counts[t.value];
          const isPendingWithCount = t.value === 'pending' && count > 0;
          return (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className={cn(
                'relative gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-mid shadow-sm',
                'data-[state=active]:border-vendor data-[state=active]:bg-vendor data-[state=active]:text-white',
              )}
            >
              <span>{t.label}</span>
              <span
                className={cn(
                  'flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                  isPendingWithCount
                    ? 'bg-brand text-white animate-pulse motion-reduce:animate-none'
                    : 'bg-surface text-dark group-data-[state=active]:bg-white/20 group-data-[state=active]:text-white',
                )}
              >
                {count}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="pending" className="mt-4">
        <BucketList
          orders={buckets.pending}
          isLoading={isLoadingActive}
          emptyTitle="No pending orders"
          emptyHint="New orders will appear here automatically — and the kitchen will chime."
        />
      </TabsContent>
      <TabsContent value="preparing" className="mt-4">
        <BucketList
          orders={buckets.preparing}
          isLoading={isLoadingActive}
          emptyTitle="Nothing being prepared right now"
          emptyHint="Accept a pending order to move it here."
        />
      </TabsContent>
      <TabsContent value="dispatched" className="mt-4">
        <BucketList
          orders={buckets.dispatched}
          isLoading={isLoadingActive}
          emptyTitle="Nothing out for delivery"
          emptyHint="Mark an order as dispatched once it's en route."
        />
      </TabsContent>
      <TabsContent value="delivered" className="mt-4">
        <BucketList
          orders={delivered}
          isLoading={isLoadingDelivered}
          emptyTitle="No delivered orders yet"
          emptyHint="Completed orders show up here for easy reference."
        />
      </TabsContent>
    </Tabs>
  );
}

function BucketList({
  orders,
  isLoading,
  emptyTitle,
  emptyHint,
}: {
  orders: ReturnType<typeof useActiveOrders>['data'];
  isLoading: boolean;
  emptyTitle: string;
  emptyHint: string;
}) {
  if (isLoading) {
    return (
      <div className="fp-card p-6 text-center text-sm text-mid">Loading orders…</div>
    );
  }
  if (!orders || orders.length === 0) {
    return (
      <div className="fp-card p-8 text-center">
        <p className="text-base font-semibold text-dark">{emptyTitle}</p>
        <p className="mt-1 text-xs text-mid">{emptyHint}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {orders.map((o) => (
        <VendorOrderCard key={o.id} order={o} />
      ))}
    </div>
  );
}
