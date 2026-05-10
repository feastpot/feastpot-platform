'use client';

import { Check, Loader2, X } from 'lucide-react';
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

const REVIEW_DELAY_MS = 2 * 60 * 60 * 1000;

/**
 * Order tracking. Three update vectors converge on the same query cache:
 *  1. Initial fetch + 30s `refetchInterval` from `useOrder` (safety net).
 *  2. Supabase Realtime channel listening for `UPDATE`s on this order's row.
 *  3. Manual mutation (cancel button) → cache invalidation.
 *
 * Realtime is best-effort: if RLS or the channel subscription fails, the
 * polling fallback still keeps the UI within ~30s of truth.
 */
export default function OrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params?.id;

  const { data: order, error, isLoading, refetch } = useOrder(orderId);
  const cancelMut = useCancelOrder();
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);

  // Subscribe to Realtime updates on this order row.
  useEffect(() => {
    if (!orderId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => {
          // Cheaper than parsing payload.new — refetch keeps types aligned.
          void refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, refetch]);

  // Show "rate your order" CTA 2h after delivery.
  useEffect(() => {
    if (!order?.deliveredAt) return;
    const ready = new Date(order.deliveredAt).getTime() + REVIEW_DELAY_MS;
    const tick = () => setShowReviewPrompt(Date.now() >= ready);
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [order?.deliveredAt]);

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

  return (
    <PageShell>
      <div className="space-y-5 py-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Order #{order.orderNumber}</h1>
          {order.scheduledFor && (
            <p className="text-sm text-muted-foreground">
              Scheduled for {new Date(order.scheduledFor).toLocaleString()}
            </p>
          )}
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
            return (
              <li
                key={s.status}
                className={cn(
                  'flex items-center gap-3 rounded-md border p-3',
                  isCurrent ? 'border-brand bg-brand/5' : 'border-border',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    isDone && 'bg-teal text-white',
                    isCurrent && 'bg-brand text-white',
                    !isDone && !isCurrent && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isDone && <Check className="h-4 w-4" aria-hidden />}
                  {isCurrent && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                </span>
                <span className={cn('text-sm', isCurrent ? 'font-semibold' : 'font-medium text-foreground')}>
                  {s.label}
                </span>
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

        {/* Review prompt */}
        {showReviewPrompt && (
          <div className="rounded-lg border border-brand/40 bg-brand/5 p-4 text-sm">
            <h3 className="font-semibold">How was your order?</h3>
            <p className="mt-1 text-muted-foreground">Your review helps your community find great cooks.</p>
            <button
              type="button"
              onClick={() => router.push(`/orders/${order.id}/review`)}
              className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Rate your order
            </button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
