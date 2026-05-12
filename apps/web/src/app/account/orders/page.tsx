'use client';

import { format } from 'date-fns';
import { ArrowRight, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { cn } from '@feastpot/ui';

import { useOrders, useReorder } from '@/hooks/use-orders';
import type { Order, OrderStatus } from '@/lib/api/orders';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

const STATUS_BADGE: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
  accepted: { label: 'Accepted', cls: 'bg-blue-100 text-blue-800' },
  preparing: { label: 'Preparing', cls: 'bg-blue-100 text-blue-800' },
  dispatched: { label: 'Out for delivery', cls: 'bg-teal-light text-teal-dark' },
  delivered: { label: 'Delivered', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-100 text-rose-800' },
  refunded: { label: 'Refunded', cls: 'bg-slate-100 text-slate-800' },
};

/**
 * Order history. /account/* is auth-gated by middleware so we don't need a
 * client-side check here. The list is cursor-paginated via TanStack Query's
 * `useInfiniteQuery`; "Reorder" calls POST /v1/orders/{id}/reorder which
 * server-side re-creates an order + a fresh PaymentIntent.
 *
 * NOTE on "Reorder" routing: the endpoint mints a new order today but does
 * NOT bring the user back through Stripe checkout (the brief says "navigate
 * to checkout on success", but our /reorder route already returns an order
 * with an authorised PaymentIntent — there's no checkout step to perform).
 * We route to the new order's tracking page instead, which matches reality.
 * If the API contract changes to return only a basket-rehydration payload,
 * change the redirect to `/checkout` here.
 */
export default function OrderHistoryPage() {
  const router = useRouter();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useOrders();
  const reorderMut = useReorder();
  const [reorderId, setReorderId] = useState<string | null>(null);

  if (isLoading) {
    return <p className="px-4 py-12 text-center text-sm text-mid">Loading orders&hellip;</p>;
  }
  if (error) {
    return <p className="px-4 py-12 text-center text-sm text-destructive">Couldn&rsquo;t load orders.</p>;
  }

  const orders = data?.pages.flatMap((p) => p.data) ?? [];

  if (orders.length === 0) {
    return (
      <section className="space-y-3 px-4 py-12 text-center">
        <h1 className="text-xl font-semibold text-dark">No orders yet</h1>
        <p className="text-sm text-mid">Find a vendor and place your first order.</p>
        <Link
          href="/vendors"
          className="inline-block rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Browse vendors
        </Link>
      </section>
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
      router.push(`/orders/${result.order.id}/tracking`);
    } finally {
      setReorderId(null);
    }
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-2xl font-bold tracking-tight text-dark">Your orders</h1>

      <ul className="space-y-3">
        {orders.map((order) => {
          const itemSummary = order.items
            ? order.items.slice(0, 2).map((i) => `${i.quantity}× ${i.nameSnapshot}`).join(', ') +
              (order.items.length > 2 ? ` +${order.items.length - 2} more` : '')
            : '';
          const isDelivered = order.status === 'delivered';
          const isActive = ['pending', 'accepted', 'preparing', 'dispatched'].includes(order.status);
          const badge = STATUS_BADGE[order.status];
          return (
            <li
              key={order.id}
              className="rounded-2xl border border-border bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                {order.vendor?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={order.vendor.logoUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand"
                    aria-hidden
                  >
                    {(order.vendor?.businessName ?? '?').slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="line-clamp-1 text-sm font-semibold text-dark">
                      {order.vendor?.businessName ?? 'Vendor'}
                    </h2>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        badge.cls,
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-mid">
                    {format(new Date(order.createdAt), 'd MMM yyyy')} · #{order.orderNumber}
                  </p>
                  {itemSummary && (
                    <p className="mt-1 line-clamp-1 text-xs text-mid">{itemSummary}</p>
                  )}
                  <p className="mt-1 text-base font-bold tabular-nums text-dark">
                    {formatPounds(order.totalPence)}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isDelivered && (
                      <Link
                        href={`/orders/${order.id}/review`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                      >
                        <Star className="h-3.5 w-3.5 fill-brand text-brand" aria-hidden />
                        Leave a review
                      </Link>
                    )}
                    <Link
                      href={`/orders/${order.id}/tracking`}
                      className="text-xs font-semibold text-teal hover:underline"
                    >
                      {isActive ? 'Track' : 'View'}
                    </Link>
                    {isDelivered && (
                      <button
                        type="button"
                        onClick={() => onReorder(order)}
                        disabled={reorderId === order.id}
                        className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-dark hover:border-brand/50 hover:bg-brand/5 disabled:opacity-50"
                      >
                        {reorderId === order.id ? (
                          'Reordering…'
                        ) : (
                          <>
                            Reorder
                            <ArrowRight className="h-3 w-3" aria-hidden />
                          </>
                        )}
                      </button>
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
          className="w-full rounded-2xl border border-border bg-white py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
