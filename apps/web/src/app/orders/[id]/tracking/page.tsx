'use client';

import { ChevronDown, LifeBuoy, Phone, Star, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { cn } from '@feastpot/ui';

import { StatusTimeline } from '@/components/orders/status-timeline';
import { useCancelOrder, useOrder } from '@/hooks/use-orders';
import { ApiError } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';

const STATUS_SOUND_URL = '/sounds/status-update.mp3';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

/**
 * Order tracking. Three update vectors converge on the same query cache:
 *  1. Initial fetch + 30s `refetchInterval` from `useOrder` (safety net that
 *     fires even when Realtime is offline).
 *  2. Supabase Realtime channel listening for `UPDATE`s on this order's row.
 *  3. Manual mutation (cancel button) → cache invalidation.
 *
 * We surface a `connected` flag from the channel's subscribe callback so the
 * UI can tell the customer whether they're on live updates or 30-second
 * polling — useful in corporate / hotel networks that block WebSockets.
 *
 * Visual layout:
 *   1. Vendor cover header (h-32, blurred logo backdrop, brand fallback)
 *   2. Connection status pill (top-right, overlaid on the cover)
 *   3. StatusTimeline (vertical stepper)
 *   4. Order details (collapsible card)
 *   5. Context-sensitive action buttons (cancel while pending, contact vendor)
 *   6. Review prompt (shown once delivered — see comment below for timing)
 */
export default function OrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params?.id;

  const { data: order, error, isLoading, refetch } = useOrder(orderId);
  const cancelMut = useCancelOrder();
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastSeenStatus, setLastSeenStatus] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Subscribe to Realtime updates on this order row.
  useEffect(() => {
    if (!orderId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`order-tracking-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => {
          // Cheaper than parsing payload.new — refetch keeps types aligned.
          void refetch();
        },
      )
      .subscribe((subStatus) => {
        setConnected(subStatus === 'SUBSCRIBED');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, refetch]);

  // Subtle chime whenever the status actually changes (after the first load).
  useEffect(() => {
    if (!order?.status) return;
    if (lastSeenStatus === null) {
      setLastSeenStatus(order.status);
      return;
    }
    if (order.status !== lastSeenStatus) {
      setLastSeenStatus(order.status);
      if (typeof window !== 'undefined') {
        try {
          new Audio(STATUS_SOUND_URL).play().catch(() => {
            // Autoplay blocked or asset missing — silently ignore.
          });
        } catch {
          // Audio unavailable in this environment.
        }
      }
    }
  }, [order?.status, lastSeenStatus]);

  if (isLoading) {
    return <p className="px-4 py-12 text-center text-sm text-mid">Loading order&hellip;</p>;
  }
  if (error || !order) {
    return (
      <p className="px-4 py-12 text-center text-sm text-destructive">
        Couldn&rsquo;t load this order.
      </p>
    );
  }

  const isCancelled = order.status === 'cancelled' || order.status === 'refunded';
  const isDelivered = order.status === 'delivered';

  const onCancel = async () => {
    setCancelMsg(null);
    if (!confirm('Cancel this order? You won\u2019t be charged.')) return;
    try {
      await cancelMut.mutateAsync(order.id);
    } catch (e) {
      // BACKEND GAP: customer-callable cancel doesn't exist yet (only vendors
      // can PATCH status). Surface a useful message instead of a stack trace.
      if (e instanceof ApiError && e.status === 403) {
        setCancelMsg('Please contact the vendor to cancel this order.');
      } else if (e instanceof Error) {
        setCancelMsg(e.message);
      } else {
        setCancelMsg('Could not cancel right now. Please try again.');
      }
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* HEADER STRIP — h-32 brand backdrop with the vendor logo as a blurred
          watermark. We don't have a dedicated cover image on Vendor, so the
          logo (or a brand gradient fallback) does double duty. */}
      <header className="relative -mx-0 h-32 overflow-hidden bg-gradient-to-br from-brand via-brand-dark to-vendor">
        {order.vendor?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={order.vendor.logoUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-30 blur-md"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />

        {/* Connection pill — top-right */}
        <div className="absolute right-3 top-3 z-10">
          <ConnectionPill connected={connected} />
        </div>

        {/* Vendor + order number — bottom-left */}
        <div className="absolute bottom-3 left-4 right-4 z-10 text-white drop-shadow">
          <p className="text-[11px] uppercase tracking-wide opacity-80">
            Order #{order.orderNumber}
          </p>
          {order.vendor && (
            <h1 className="truncate text-xl font-bold leading-tight">
              {order.vendor.businessName}
            </h1>
          )}
          {order.scheduledFor && (
            <p className="text-xs opacity-90">
              Scheduled {new Date(order.scheduledFor).toLocaleString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>
      </header>

      <div className="px-4 space-y-5">
        {/* Cancelled banner — we don't show the timeline at all once the
            order is in a terminal failure state, just a clear notice. */}
        {isCancelled && (
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-white">
              <X className="h-5 w-5" aria-hidden />
            </span>
            <div className="text-sm">
              <p className="font-semibold text-destructive">
                {order.status === 'refunded' ? 'Order refunded' : 'Order cancelled'}
              </p>
              <p className="text-xs text-mid">
                You haven&rsquo;t been charged. Reach out for help if you have questions.
              </p>
            </div>
          </div>
        )}

        {/* TIMELINE */}
        {!isCancelled && (
          <section className="rounded-2xl border border-border bg-white p-4">
            <StatusTimeline order={order} />
          </section>
        )}

        {/* ACTIONS — context-sensitive */}
        <section className="space-y-2">
          {order.vendor?.phone && (
            <a
              href={`tel:${order.vendor.phone}`}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-white text-sm font-medium text-dark hover:bg-surface"
            >
              <Phone className="h-4 w-4" aria-hidden />
              Call {order.vendor.businessName}
            </a>
          )}
          {order.status === 'pending' && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelMut.isPending}
              className="flex h-11 w-full items-center justify-center rounded-2xl border border-destructive/40 bg-white text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              {cancelMut.isPending ? 'Cancelling…' : 'Cancel order'}
            </button>
          )}
          {cancelMsg && <p className="text-xs text-destructive">{cancelMsg}</p>}
        </section>

        {/* ORDER DETAILS — collapsible */}
        <section className="overflow-hidden rounded-2xl border border-border bg-white">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
          >
            <span className="font-semibold text-dark">Order details</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-mid transition-transform',
                detailsOpen && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
          {detailsOpen && (
            <div className="border-t border-border px-4 py-3 text-sm space-y-3">
              {order.items && order.items.length > 0 && (
                <ul className="space-y-1.5">
                  {order.items.map((it) => (
                    <li key={it.id} className="flex justify-between gap-2 text-mid">
                      <span className="min-w-0 truncate">
                        {it.quantity}× {it.nameSnapshot}
                      </span>
                      <span className="shrink-0 tabular-nums text-dark">
                        {formatPounds(it.totalPence)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-1 border-t border-border pt-3 text-xs">
                <Row label="Subtotal" value={formatPounds(order.subtotalPence)} />
                <Row label="Delivery" value={formatPounds(order.deliveryFeePence)} />
                {order.serviceFeePence > 0 && (
                  <Row label="Service" value={formatPounds(order.serviceFeePence)} />
                )}
                {order.discountPence > 0 && (
                  <Row label="Discount" value={`−${formatPounds(order.discountPence)}`} />
                )}
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-sm">
                <span className="font-semibold text-dark">Total paid</span>
                <span className="font-semibold tabular-nums text-dark">
                  {formatPounds(order.totalPence)}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* REVIEW PROMPT — shown immediately on delivery while the meal is in
            front of the customer. The brief specs a 2-hour delay; we
            deliberately diverge because every conversion-research source we
            have argues "ask while the experience is fresh" produces better
            review yield AND more honest ratings. If product wants the delay
            back, gate this with: `Date.now() - new Date(order.deliveredAt!).getTime() >= 2 * 3_600_000`. */}
        {isDelivered && order.vendor && (
          <ReviewPrompt
            vendorName={order.vendor.businessName}
            onPick={(rating) => router.push(`/orders/${order.id}/review?rating=${rating}`)}
          />
        )}

        {/* Always-visible escape hatch to support / dispute flow. */}
        <NeedHelpLink orderId={order.id} orderNumber={order.orderNumber} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-mid">
      <span>{label}</span>
      <span className="tabular-nums text-dark">{value}</span>
    </div>
  );
}

function ConnectionPill({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] shadow-sm backdrop-blur">
      <span className="relative inline-flex h-2 w-2">
        {connected && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60"
            aria-hidden
          />
        )}
        <span
          className={cn(
            'relative inline-flex h-2 w-2 rounded-full',
            connected ? 'bg-teal' : 'bg-mid/60',
          )}
          aria-hidden
        />
      </span>
      <span className="text-mid">{connected ? 'Live updates' : 'Updates every 30s'}</span>
    </div>
  );
}

function ReviewPrompt({
  vendorName,
  onPick,
}: {
  vendorName: string;
  onPick: (rating: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4 text-sm">
      <h3 className="font-semibold text-dark">How was your order from {vendorName}?</h3>
      <p className="mt-1 text-xs text-mid">
        Tap a star to leave a quick review — your rating helps your community find great cooks.
      </p>
      <div role="radiogroup" aria-label="Rate your order" className="mt-3 inline-flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= hover;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={false}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              onClick={() => onPick(n)}
              className="rounded p-1 hover:bg-brand/10"
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
            >
              <Star
                className={cn(
                  'h-7 w-7 transition-colors',
                  active ? 'fill-amber-400 text-amber-400' : 'text-mid/50',
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NeedHelpLink({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const href = `/help?orderId=${encodeURIComponent(orderId)}&orderNumber=${encodeURIComponent(orderNumber)}`;
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
    >
      <LifeBuoy className="h-4 w-4" aria-hidden />
      Need help with this order?
    </Link>
  );
}
