'use client';

import { Check, LifeBuoy, Star, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { cn } from '@feastpot/ui';

import { PageShell } from '@/components/layout/page-shell';
import { useCancelOrder, useOrder } from '@/hooks/use-orders';
import { ApiError } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';
import type { OrderStatus } from '@/lib/api/orders';

const STAGES: { status: OrderStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'dispatched', label: 'Out for delivery' },
  { status: 'delivered', label: 'Delivered' },
];
const STAGE_INDEX = new Map(STAGES.map((s, i) => [s.status, i]));

const STATUS_SOUND_URL = '/sounds/status-update.mp3';

/**
 * Order tracking. Three update vectors converge on the same query cache:
 *  1. Initial fetch + 30s `refetchInterval` from `useOrder` (safety net that
 *     fires even when Realtime is offline — the same socket-fallback pattern
 *     a spec'd polling loop would give us, but routed through TanStack so
 *     the cache stays consistent with the rest of the app).
 *  2. Supabase Realtime channel listening for `UPDATE`s on this order's row.
 *  3. Manual mutation (cancel button) → cache invalidation.
 *
 * We surface a `connected` flag from the channel's subscribe callback so the
 * UI can tell the customer whether they're on live updates or 30-second
 * polling — useful in corporate / hotel networks that block WebSockets.
 */
export default function OrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params?.id;

  const { data: order, error, isLoading, refetch } = useOrder(orderId);
  const cancelMut = useCancelOrder();
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastSeenStatus, setLastSeenStatus] = useState<OrderStatus | null>(null);

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

  if (isLoading) return <PageShell><p className="py-12 text-center text-sm text-muted-foreground">Loading order&hellip;</p></PageShell>;
  if (error || !order) {
    return (
      <PageShell>
        <p className="py-12 text-center text-sm text-destructive">Couldn&rsquo;t load this order.</p>
      </PageShell>
    );
  }

  const currentIdx = STAGE_INDEX.get(order.status) ?? -1;
  const isCancelled = order.status === 'cancelled' || order.status === 'refunded';
  const isDelivered = order.status === 'delivered';

  const onCancel = async () => {
    setCancelMsg(null);
    if (!confirm('Cancel this order? You won&rsquo;t be charged.')) return;
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

  const stageTimestamp = (status: OrderStatus, isDone: boolean, isCurrent: boolean): string | null => {
    switch (status) {
      case 'accepted':
        return order.acceptedAt ? `Accepted at ${formatTime(order.acceptedAt)}` : null;
      case 'dispatched':
        return order.dispatchedAt ? `Dispatched at ${formatTime(order.dispatchedAt)}` : null;
      case 'delivered':
        if (order.deliveredAt) return `Delivered at ${formatTime(order.deliveredAt)}`;
        if (isCurrent && order.scheduledFor) return `Expected by ${formatTime(order.scheduledFor)}`;
        return null;
      default:
        // Pending / preparing don't have a dedicated timestamp on the order.
        return isDone ? null : null;
    }
  };

  return (
    <PageShell>
      <div className="space-y-5 py-4">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Order #{order.orderNumber}</h1>
            {order.scheduledFor && (
              <p className="text-sm text-muted-foreground">
                Scheduled for {new Date(order.scheduledFor).toLocaleString()}
              </p>
            )}
          </div>
          <ConnectionDot connected={connected} />
        </header>

        {/* Vendor info shown after acceptance */}
        {order.vendor && currentIdx >= 1 && (
          <section className="rounded-lg border border-border p-3 text-sm">
            <h2 className="font-semibold">Your cook</h2>
            <p className="mt-1">
              <Link href={`/vendors/${order.vendor.slug}`} className="text-brand hover:underline">
                {order.vendor.businessName}
              </Link>
            </p>
            {order.vendor.phone && (
              <a href={`tel:${order.vendor.phone}`} className="mt-1 inline-block text-sm text-foreground underline-offset-2 hover:underline">
                Call {order.vendor.phone}
              </a>
            )}
          </section>
        )}

        {/* Timeline */}
        <ol className="space-y-3">
          {STAGES.map((s, idx) => {
            const isDone = !isCancelled && idx < currentIdx;
            const isCurrent = !isCancelled && idx === currentIdx;
            const isFuture = !isCancelled && idx > currentIdx;
            const stamp = stageTimestamp(s.status, isDone, isCurrent);
            return (
              <li
                key={s.status}
                className={cn(
                  'flex items-center gap-3 rounded-md border p-3 transition-colors',
                  isCurrent && 'border-brand bg-brand/5',
                  isDone && 'border-teal/40 bg-teal/5',
                  isFuture && 'border-dashed border-border/60 bg-transparent',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    isDone && 'bg-teal text-white',
                    isCurrent && 'bg-brand text-white',
                    isFuture && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isDone && <Check className="h-4 w-4" aria-hidden />}
                  {isCurrent && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm',
                      isCurrent ? 'font-semibold text-foreground' : 'font-medium',
                      isFuture && 'text-muted-foreground',
                    )}
                  >
                    {s.label}
                  </p>
                  {stamp && <p className="text-xs text-muted-foreground">{stamp}</p>}
                </div>
              </li>
            );
          })}
          {isCancelled && (
            <li className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-white">
                <X className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-destructive">
                {order.status === 'refunded' ? 'Refunded' : 'Cancelled'}
              </span>
            </li>
          )}
        </ol>

        {/* Cancel (only when pending) */}
        {order.status === 'pending' && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelMut.isPending}
              className="w-full rounded-md border border-destructive/40 bg-background py-2 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              {cancelMut.isPending ? 'Cancelling…' : 'Cancel order'}
            </button>
            {cancelMsg && <p className="text-xs text-destructive">{cancelMsg}</p>}
          </div>
        )}

        {/* Review prompt — shown immediately on delivery so a happy customer
            can rate while the meal is still in front of them. */}
        {isDelivered && order.vendor && (
          <ReviewPrompt
            vendorName={order.vendor.businessName}
            onPick={(rating) => router.push(`/orders/${order.id}/review?rating=${rating}`)}
          />
        )}

        {/* Always-visible escape hatch to support / dispute flow. */}
        <NeedHelpLink orderId={order.id} orderNumber={order.orderNumber} />
      </div>
    </PageShell>
  );
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-xs">
      <span className="relative inline-flex h-2 w-2">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" aria-hidden />
        )}
        <span
          className={cn('relative inline-flex h-2 w-2 rounded-full', connected ? 'bg-teal' : 'bg-muted-foreground/60')}
          aria-hidden
        />
      </span>
      <span className="text-muted-foreground">
        {connected ? 'Live updates active' : 'Updates every 30s'}
      </span>
    </div>
  );
}

function ReviewPrompt({ vendorName, onPick }: { vendorName: string; onPick: (rating: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="rounded-lg border border-brand/40 bg-brand/5 p-4 text-sm">
      <h3 className="font-semibold">How was your order from {vendorName}?</h3>
      <p className="mt-1 text-xs text-muted-foreground">
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
                  active ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50',
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
  // Deep-links to /help with the order context. A dedicated dispute creation
  // form is a follow-up; for now the help page surfaces support contacts and
  // explains the dispute flow.
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

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}
