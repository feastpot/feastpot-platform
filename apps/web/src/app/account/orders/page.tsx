'use client';

import { format } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { cn } from '@feastpot/ui';

import { PageShell } from '@/components/layout/page-shell';
import { useOrders, useReorder } from '@/hooks/use-orders';
import type { Order, OrderStatus } from '@/lib/api/orders';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  accepted: 'bg-blue-100 text-blue-800',
  preparing: 'bg-blue-100 text-blue-800',
  dispatched: 'bg-purple-100 text-purple-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-rose-100 text-rose-800',
  refunded: 'bg-slate-100 text-slate-800',
};

/**
 * Order history. /account/* is auth-gated by middleware so we don't need a
 * client-side check here. The list is cursor-paginated; "Reorder" creates a
 * brand-new order via POST /v1/orders/:id/reorder and routes to its tracking
 * page (the new order ships with a fresh Stripe PaymentIntent — see backend
 * note: the /reorder route currently re-runs the create flow which means the
 * customer should ideally complete payment, but our UI only routes to
 * tracking. This is a known UX gap until the API documents the contract).
 */
export default function OrderHistoryPage() {
  const router = useRouter();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useOrders();
  const reorderMut = useReorder();
  const [reorderId, setReorderId] = useState<string | null>(null);

  if (isLoading) return <PageShell><p className="py-12 text-center text-sm text-muted-foreground">Loading orders&hellip;</p></PageShell>;
  if (error) return <PageShell><p className="py-12 text-center text-sm text-destructive">Couldn&rsquo;t load orders.</p></PageShell>;

  const orders = data?.pages.flatMap((p) => p.data) ?? [];

  if (orders.length === 0) {
    return (
      <PageShell>
        <section className="space-y-3 py-12 text-center">
          <h1 className="text-xl font-semibold">No orders yet</h1>
          <p className="text-sm text-muted-foreground">Find a vendor and place your first order.</p>
          <Link href="/vendors" className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Browse vendors
          </Link>
        </section>
      </PageShell>
    );
  }

  const onReorder = async (order: Order) => {
    setReorderId(order.id);
    try {
      // Reorder needs a future scheduledFor — default to "tomorrow at 12:00".
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(12, 0, 0, 0);
      const result = await reorderMut.mutateAsync({
        orderId: order.id,
        input: { scheduledFor: tomorrow.toISOString() },
      });
      // The reorder flow already created the new order + a PaymentIntent.
      // Route to its tracking page; payment confirmation is a known gap.
      router.push(`/orders/${result.order.id}/tracking`);
    } finally {
      setReorderId(null);
    }
  };

  return (
    <PageShell>
      <div className="space-y-4 py-4">
        <h1 className="text-2xl font-bold tracking-tight">Your orders</h1>

        <ul className="space-y-3">
          {orders.map((order) => {
            const itemSummary = order.items
              ? order.items.slice(0, 2).map((i) => `${i.quantity}× ${i.nameSnapshot}`).join(', ') +
                (order.items.length > 2 ? ` +${order.items.length - 2} more` : '')
              : '';
            const isDelivered = order.status === 'delivered';
            return (
              <li key={order.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start gap-3">
                  {order.vendor?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={order.vendor.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-full bg-muted" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="line-clamp-1 font-semibold">{order.vendor?.businessName ?? 'Vendor'}</h2>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', STATUS_BADGE[order.status])}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(order.createdAt), 'd MMM yyyy')} • #{order.orderNumber}
                    </p>
                    {itemSummary && (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{itemSummary}</p>
                    )}
                    <p className="mt-1 text-sm font-semibold">{formatPounds(order.totalPence)}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/orders/${order.id}/tracking`}
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => onReorder(order)}
                        disabled={reorderId === order.id}
                        className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                      >
                        {reorderId === order.id ? 'Reordering…' : 'Reorder'}
                      </button>
                      {isDelivered && (
                        <Link
                          href={`/orders/${order.id}/review`}
                          className="rounded-md border border-brand/40 bg-brand/5 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/10"
                        >
                          Leave a review
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {hasNextPage && (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full rounded-md border border-border bg-background py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </PageShell>
  );
}
