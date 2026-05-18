'use client';

import { format } from 'date-fns';
import { RotateCcw, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { cn } from '@feastpot/ui';

import { useOrders } from '@/hooks/use-orders';
import type { Order, OrderStatus } from '@/lib/api/orders';
import { API_URL } from '@/lib/env';
import { CrossVendorBasketError, useBasketStore } from '@/store/basket.store';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

const STATUS_BADGE: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-plantain/20 text-plantain-dark' },
  accepted: { label: 'Accepted', cls: 'bg-brand-light text-brand-dark' },
  preparing: { label: 'Preparing', cls: 'bg-brand-light text-brand-dark' },
  dispatched: { label: 'Out for delivery', cls: 'bg-plantain/30 text-plantain-dark' },
  delivered: { label: 'Delivered', cls: 'bg-brand/15 text-brand-dark' },
  cancelled: { label: 'Cancelled', cls: 'bg-scotch/10 text-scotch' },
  refunded: { label: 'Refunded', cls: 'bg-cream-deep text-charcoal-mid' },
};

/**
 * Order history. /account/* is auth-gated by middleware so we don't need a
 * client-side check here. The list is cursor-paginated via TanStack Query's
 * `useInfiniteQuery`.
 *
 * "Reorder" REHYDRATES THE BASKET and routes to /checkout - it does NOT auto-
 * mint a new order. The previous behaviour (POST /v1/orders/{id}/reorder)
 * silently re-used the original order's `scheduledFor`, which by the time
 * the customer tapped Reorder was either booked-out or in the past. Sending
 * the customer back through checkout forces fresh slot selection against the
 * vendor's live availability.
 */
export default function OrderHistoryPage() {
  const router = useRouter();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useOrders();
  const [reorderId, setReorderId] = useState<string | null>(null);

  if (isLoading) {
    return <p className="px-4 py-12 text-center text-sm text-charcoal-mid">Loading orders&hellip;</p>;
  }
  if (error) {
    return <p className="px-4 py-12 text-center text-sm text-scotch">Couldn&rsquo;t load orders.</p>;
  }

  const orders = data?.pages.flatMap((p) => p.data) ?? [];

  if (orders.length === 0) {
    return (
      <section className="space-y-3 px-4 py-12 text-center">
        <h1 className="font-display text-xl font-black text-charcoal">No orders yet</h1>
        <p className="text-sm text-charcoal-mid">Find a vendor and place your first order.</p>
        <Link
          href="/vendors"
          className="inline-block rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-dark"
        >
          Browse vendors
        </Link>
      </section>
    );
  }

  const onReorder = async (order: Order) => {
    // Single-flight: if any row's reorder is already in progress, ignore
    // further clicks. Per-row `disabled` only blocks the SAME button - a
    // user could otherwise tap Reorder on order B while A's vendor fetch
    // was still resolving and end up racing two basket-rehydrate flows
    // into a single redirect.
    if (reorderId !== null) return;
    setReorderId(order.id);
    try {
      // Hit the public vendor lookup so we (a) confirm the vendor still
      // exists/serves and (b) get the canonical { id, name, slug } the basket
      // store needs to lock to a vendor. Public endpoint - no auth header.
      const vendorRes = await fetch(`${API_URL}/v1/vendors/${order.vendorId}`, {
        cache: 'no-store',
      });
      if (!vendorRes.ok) {
        window.alert('Sorry, this vendor is no longer available.');
        return;
      }
      const vendor = (await vendorRes.json()) as { id: string; businessName: string; slug: string };

      const store = useBasketStore.getState();
      // Cross-vendor guard. If the customer already has items from a DIFFERENT
      // vendor, ask before clobbering - single-vendor basket is enforced by
      // the store and silently dropping items would feel hostile.
      if (store.items.length > 0 && store.vendor && store.vendor.id !== order.vendorId) {
        const ok = window.confirm(
          'This will replace items currently in your basket. Continue?',
        );
        if (!ok) return;
        store.clearBasket();
      } else if (store.items.length > 0 && store.vendor?.id === order.vendorId) {
        // Same vendor - start fresh anyway so quantities reflect THIS order
        // exactly, not "this order PLUS whatever was already pending".
        store.clearBasket();
      }

      const basketVendor = { id: vendor.id, name: vendor.businessName, slug: vendor.slug };
      const items = order.items ?? [];
      try {
        for (const item of items) {
          // Field-map: API OrderItem uses `nameSnapshot` + `unitPence`;
          // the basket store uses `menuItemName` + `unitPricePence` and
          // computes `lineTotalPence` itself, so we omit it here.
          useBasketStore.getState().addItem(
            {
              menuItemId: item.menuItemId,
              menuItemName: item.nameSnapshot,
              quantity: item.quantity,
              unitPricePence: item.unitPence,
              customisationNotes: item.notes ?? undefined,
            },
            basketVendor,
          );
        }
      } catch (err) {
        // Defensive: addItem can throw CrossVendorBasketError if a parallel
        // tab raced us. Reset and bail with a clear message rather than
        // leaving the basket half-populated.
        if (err instanceof CrossVendorBasketError) {
          useBasketStore.getState().clearBasket();
          window.alert('Your basket changed in another tab - please try again.');
          return;
        }
        throw err;
      }

      router.push('/checkout');
    } catch {
      window.alert('Could not reorder - please try again.');
    } finally {
      setReorderId(null);
    }
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Your orders</h1>

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
              className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm"
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
                    <h2 className="line-clamp-1 text-sm font-bold text-charcoal">
                      {order.vendor?.businessName ?? 'Vendor'}
                    </h2>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                        badge.cls,
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-charcoal-mid">
                    {format(new Date(order.createdAt), 'd MMM yyyy')} · #{order.orderNumber}
                  </p>
                  {itemSummary && (
                    <p className="mt-1 line-clamp-1 text-xs text-charcoal-mid">{itemSummary}</p>
                  )}
                  <p className="mt-1 text-base font-bold tabular-nums text-charcoal">
                    {formatPounds(order.totalPence)}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isDelivered && (
                      <Link
                        href={`/orders/${order.id}/review`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline"
                      >
                        <Star className="h-3.5 w-3.5 fill-plantain text-plantain" aria-hidden />
                        Leave a review
                      </Link>
                    )}
                    <Link
                      href={`/orders/${order.id}/tracking`}
                      className="text-xs font-bold text-brand hover:underline"
                    >
                      {isActive ? 'Track' : 'View'}
                    </Link>
                    {isDelivered && (
                      <button
                        type="button"
                        onClick={() => onReorder(order)}
                        disabled={reorderId === order.id}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-cream-deep bg-white px-3 py-1.5 text-xs font-bold text-charcoal hover:border-brand/50 hover:bg-brand/5 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        {reorderId === order.id ? 'Adding…' : 'Reorder'}
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
          className="w-full rounded-xl border border-cream-deep bg-white py-3 text-sm font-bold text-charcoal hover:bg-cream disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
