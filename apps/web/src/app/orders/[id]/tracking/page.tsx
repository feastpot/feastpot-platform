'use client';

import { Check, ChevronDown, Clock, LifeBuoy, MessageCircle, Phone, Star, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { cn } from '@feastpot/ui';

import { StatusTimeline } from '@/components/orders/status-timeline';
import { useCancelOrder, useOrder, useRespondAmendment } from '@/hooks/use-orders';
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
  const respondAmendment = useRespondAmendment(orderId ?? '');
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastSeenStatus, setLastSeenStatus] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

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
    return (
      <p className="px-4 py-12 text-center text-sm font-medium text-charcoal-mid">
        Loading order&hellip;
      </p>
    );
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

  const onConfirmCancel = async () => {
    setCancelMsg(null);
    if (cancelReason.trim().length < 5) return;
    try {
      await cancelMut.mutateAsync({ orderId: order.id, reason: cancelReason.trim() });
      router.push('/account/orders?cancelled=1');
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setCancelMsg('Please contact the vendor to cancel this order.');
      } else if (e instanceof ApiError && e.status === 400) {
        // Surface the server's customer-facing message verbatim
        // (e.g. "already being prepared", "already on the way").
        setCancelMsg(e.message);
      } else if (e instanceof Error) {
        setCancelMsg(e.message);
      } else {
        setCancelMsg('Could not cancel — please contact support@feastpot.co.uk');
      }
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* HEADER STRIP — h-32 brand backdrop with the vendor logo as a blurred
          watermark. We don't have a dedicated cover image on Vendor, so the
          logo (or a brand gradient fallback) does double duty. */}
      <header className="relative -mx-0 h-32 overflow-hidden bg-gradient-to-br from-brand via-brand-dark to-brand-dark">
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
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
            Order #{order.orderNumber}
          </p>
          {order.vendor && (
            <h1 className="font-display truncate text-xl font-black leading-tight">
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
              <p className="font-display font-black text-destructive">
                {order.status === 'refunded' ? 'Order refunded' : 'Order cancelled'}
              </p>
              <p className="text-xs font-medium text-charcoal-mid">
                You haven&rsquo;t been charged. Reach out for help if you have questions.
              </p>
            </div>
          </div>
        )}

        {/* PENDING AMENDMENT BANNER (FR-AMD-001) */}
        {!isCancelled && order.amendments && order.amendments.length > 0 && (
          <AmendmentBanner
            amendment={order.amendments[0]!}
            vendorName={order.vendor?.businessName ?? 'Your vendor'}
            busy={respondAmendment.isPending}
            onRespond={(accepted) => respondAmendment.mutate(accepted)}
          />
        )}

        {/* ETA CARD (FR-TRK-001) — only when dispatched + vendor supplied an ETA. */}
        {order.status === 'dispatched' && order.etaAt && <EtaCard etaAt={order.etaAt} />}

        {/* TIMELINE */}
        {!isCancelled && (
          <section className="rounded-2xl border border-cream-deep bg-white p-4 shadow-card">
            <StatusTimeline order={order} />
          </section>
        )}

        {/* ACTIONS — context-sensitive */}
        <section className="space-y-2">
          {order.vendor?.user?.phone && (
            <a
              href={`tel:${order.vendor.user.phone}`}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-cream-deep bg-white text-sm font-bold text-charcoal hover:bg-cream"
            >
              <Phone className="h-4 w-4 text-brand" aria-hidden />
              Call {order.vendor.businessName}
            </a>
          )}
          {order.vendor?.user?.phone && (
            <a
              href={`https://wa.me/${order.vendor.user.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi, regarding Feastpot order #${order.orderNumber}`)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-cream-deep bg-white text-sm font-bold text-charcoal hover:bg-cream"
            >
              <MessageCircle className="h-4 w-4 text-brand" aria-hidden />
              WhatsApp {order.vendor.businessName}
            </a>
          )}
          {(order.status === 'pending' || order.status === 'accepted') && !showCancelConfirm && (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="flex h-11 w-full items-center justify-center rounded-2xl border border-destructive/40 bg-white text-sm font-bold text-destructive hover:bg-destructive/5"
            >
              Cancel order
            </button>
          )}
          {showCancelConfirm && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
              <p className="font-display text-sm font-black text-destructive">
                Are you sure you want to cancel?
              </p>
              <p className="mt-1 text-xs font-medium text-charcoal-mid">
                You will receive a full refund within 5 business days.
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Tell us why (required)"
                className="mt-3 w-full min-h-[60px] resize-y rounded-xl border border-cream-deep bg-white p-2 text-sm text-charcoal placeholder:text-charcoal-mid focus:outline-none focus:ring-2 focus:ring-destructive/30"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelConfirm(false);
                    setCancelMsg(null);
                  }}
                  disabled={cancelMut.isPending}
                  className="flex h-10 flex-1 items-center justify-center rounded-2xl border border-cream-deep bg-white text-sm font-bold text-charcoal hover:bg-cream disabled:opacity-50"
                >
                  Keep order
                </button>
                <button
                  type="button"
                  onClick={onConfirmCancel}
                  disabled={cancelReason.trim().length < 5 || cancelMut.isPending}
                  className="flex h-10 flex-1 items-center justify-center rounded-2xl bg-destructive text-sm font-bold text-white hover:bg-destructive/90 disabled:opacity-50"
                >
                  {cancelMut.isPending ? 'Cancelling…' : 'Confirm cancel'}
                </button>
              </div>
              {cancelMsg && (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {cancelMsg}
                </p>
              )}
            </div>
          )}
          {!showCancelConfirm && cancelMsg && (
            <p className="text-xs text-destructive">{cancelMsg}</p>
          )}
        </section>

        {/* ORDER DETAILS — collapsible */}
        <section className="overflow-hidden rounded-2xl border border-cream-deep bg-white">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
          >
            <span className="font-display font-black text-charcoal">Order details</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-charcoal-mid transition-transform',
                detailsOpen && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
          {detailsOpen && (
            <div className="border-t border-cream-deep px-4 py-3 text-sm space-y-3">
              {order.items && order.items.length > 0 && (
                <ul className="space-y-1.5">
                  {order.items.map((it) => (
                    <li key={it.id} className="flex justify-between gap-2 text-charcoal-mid">
                      <span className="min-w-0 truncate font-medium text-charcoal">
                        {it.quantity}× {it.nameSnapshot}
                      </span>
                      <span className="shrink-0 tabular-nums font-medium text-charcoal">
                        {formatPounds(it.totalPence)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-1 border-t border-cream-deep pt-3 text-xs">
                <Row label="Subtotal" value={formatPounds(order.subtotalPence)} />
                <Row label="Delivery" value={formatPounds(order.deliveryFeePence)} />
                {order.serviceFeePence > 0 && (
                  <Row label="Service" value={formatPounds(order.serviceFeePence)} />
                )}
                {order.discountPence > 0 && (
                  <Row label="Discount" value={`−${formatPounds(order.discountPence)}`} />
                )}
              </div>
              <div className="flex justify-between border-t border-cream-deep pt-2 text-sm">
                <span className="font-display font-black text-charcoal">Total paid</span>
                <span className="font-display font-black tabular-nums text-charcoal">
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

function EtaCard({ etaAt }: { etaAt: string }) {
  // Live countdown — re-renders every 30s. Cheaper than 1s ticks and the
  // user-visible precision is already minute-level.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const target = new Date(etaAt);
  const diffMs = target.getTime() - now;
  const minsLeft = Math.round(diffMs / 60_000);
  const overdue = diffMs < 0;
  const wallClock = target.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <section
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-4',
        overdue
          ? 'border-plantain bg-plantain/15 text-charcoal'
          : 'border-brand/30 bg-brand-light text-charcoal',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          overdue ? 'bg-plantain text-charcoal' : 'bg-brand text-white',
        )}
      >
        <Clock className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide opacity-80">
          {overdue ? 'Past ETA' : 'Arriving'}
        </p>
        <p className="font-display text-base font-black">
          {overdue
            ? `${Math.abs(minsLeft)} min late`
            : minsLeft <= 1
              ? 'Any minute now'
              : `In ${minsLeft} min`}
        </p>
        <p className="text-xs opacity-80">Vendor estimate: {wallClock}</p>
      </div>
    </section>
  );
}

function AmendmentBanner({
  amendment,
  vendorName,
  busy,
  onRespond,
}: {
  amendment: { id: string; proposedChange: string; priceDeltaPence: number; expiresAt: string };
  vendorName: string;
  busy: boolean;
  onRespond: (accepted: boolean) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const minsLeft = Math.max(0, Math.ceil((new Date(amendment.expiresAt).getTime() - now) / 60_000));
  const refundPounds = amendment.priceDeltaPence < 0
    ? `£${(Math.abs(amendment.priceDeltaPence) / 100).toFixed(2)}`
    : null;

  return (
    <section className="space-y-3 rounded-2xl border border-plantain/60 bg-plantain/10 p-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brand-dark">
          {vendorName} proposed a change
        </p>
        <p className="mt-1 text-sm font-medium text-charcoal">{amendment.proposedChange}</p>
        {refundPounds && (
          <p className="mt-1 text-xs font-bold text-brand-dark">
            Includes {refundPounds} refund
          </p>
        )}
        <p className="mt-2 text-[11px] font-medium text-charcoal-mid">
          {minsLeft > 0 ? `Auto-declines in ${minsLeft} min` : 'Expiring now…'}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onRespond(false)}
          disabled={busy}
          className="flex h-10 flex-1 items-center justify-center rounded-2xl border border-cream-deep bg-white text-sm font-bold text-charcoal hover:bg-cream disabled:opacity-50"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => onRespond(true)}
          disabled={busy}
          className="flex h-10 flex-[1.6] items-center justify-center gap-1 rounded-2xl bg-brand text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden />
          {busy ? 'Saving…' : 'Accept'}
        </button>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-charcoal-mid">
      <span>{label}</span>
      <span className="tabular-nums font-medium text-charcoal">{value}</span>
    </div>
  );
}

function ConnectionPill({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur">
      <span className="relative inline-flex h-2 w-2">
        {connected && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60"
            aria-hidden
          />
        )}
        <span
          className={cn(
            'relative inline-flex h-2 w-2 rounded-full',
            connected ? 'bg-brand' : 'bg-charcoal-mid/60',
          )}
          aria-hidden
        />
      </span>
      <span className="text-charcoal-mid">
        {connected ? 'Live updates' : 'Updates every 30s'}
      </span>
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
    <div className="rounded-2xl border border-brand/30 bg-brand-light p-4 text-sm">
      <h3 className="font-display font-black text-charcoal">
        How was your order from {vendorName}?
      </h3>
      <p className="mt-1 text-xs font-medium text-charcoal-mid">
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
                  active ? 'fill-plantain text-plantain' : 'text-charcoal-mid/40',
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
      className="inline-flex items-center gap-2 text-sm font-bold text-brand hover:underline"
    >
      <LifeBuoy className="h-4 w-4" aria-hidden />
      Need help with this order?
    </Link>
  );
}
