'use client';

import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeCardElementOptions } from '@stripe/stripe-js';
import { isAfter } from 'date-fns';
import { ChevronDown, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@feastpot/ui';

import { AddressSelector } from '@/components/address/address-selector';
import { SlotPicker } from '@/components/checkout/slot-picker';
import { useLoyalty } from '@/hooks/use-loyalty';
import { useConfirmOrder, useCreateOrder } from '@/hooks/use-orders';
import { ApiError } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { STRIPE_CONFIGURED, getStripe } from '@/lib/stripe';
import { useBasketStore } from '@/store/basket.store';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

/**
 * Auth-gated checkout. Middleware already redirects `/account/*` but the
 * checkout route lives outside that prefix, so we double-check here and
 * bounce to /sign-in?next=/checkout if the session went away.
 *
 * Stripe Elements MUST be mounted under <Elements>. We initialise the Stripe
 * promise once via `getStripe()` (returns null if NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 * isn't set — the page then renders a clear "Stripe not configured" notice
 * rather than a broken card form).
 */
export default function CheckoutPage() {
  const stripePromise = useMemo(() => getStripe(), []);

  if (!STRIPE_CONFIGURED) {
    return (
      <div className="px-4 py-12 text-center space-y-3">
        <h1 className="text-xl font-semibold text-dark">Checkout unavailable</h1>
        <p className="text-sm text-mid">
          Payments aren&rsquo;t configured for this environment yet
          (<code className="rounded bg-surface px-1 py-0.5 text-xs">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> is missing).
        </p>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <CheckoutInner />
    </Elements>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const { token, loading: tokenLoading } = useAccessToken();
  const items = useBasketStore((s) => s.items);
  const vendor = useBasketStore((s) => s.vendor);
  const subtotal = useBasketStore((s) => s.getSubtotalPence());
  const itemCount = useBasketStore((s) => s.getItemCount());
  const clearBasket = useBasketStore((s) => s.clearBasket);

  // Redirect to sign-in if no session (and to /vendors if basket is empty).
  useEffect(() => {
    if (tokenLoading) return;
    if (!token) {
      router.replace('/sign-in?next=/checkout');
      return;
    }
    if (items.length === 0 || !vendor) {
      router.replace('/vendors');
    }
  }, [tokenLoading, token, items.length, vendor, router]);

  const createOrder = useCreateOrder();
  const confirmOrder = useConfirmOrder();

  const stripe = useStripe();
  const elements = useElements();

  // AddressSelector owns the saved/new address UX. It returns either a
  // saved-address id, or `null` while the user is mid-add (we then block
  // the submit button so we never POST an order without a delivery address).
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  // Visual slot-picker state. We store the chosen slot as a single Date so
  // the existing scheduledFor build path stays trivial.
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [notes, setNotes] = useState<string>('');

  // Order-summary collapse state. We START open so the customer can verify
  // the items, then they can collapse it once they've reviewed. Auto-collapse
  // after 3.5s on mount nudges them to scroll into the rest of the form.
  const [summaryOpen, setSummaryOpen] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSummaryOpen(false), 3500);
    return () => clearTimeout(t);
  }, []);

  // Sticky bottom bar visibility — appears once the payment section enters
  // the viewport so the customer always has a "place order" affordance no
  // matter where they've scrolled past it.
  const paymentSectionRef = useRef<HTMLElement | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  useEffect(() => {
    const el = paymentSectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry) setShowStickyBar(entry.isIntersecting || entry.boundingClientRect.top < 0);
      },
      { rootMargin: '0px 0px -40% 0px', threshold: [0, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Loyalty redemption (FR-LOY-001). Capped at min(balance, subtotal) and
  // floored to a multiple of 100 so the stepper buttons stay sensible.
  // The actual discount is recomputed server-side; this is just UX.
  const { data: loyalty } = useLoyalty();
  const [loyaltyPoints, setLoyaltyPoints] = useState<number>(0);
  const maxRedeemable = Math.min(
    Math.floor((loyalty?.balance ?? 0) / 100) * 100,
    Math.floor(subtotal / 100) * 100,
  );
  // If basket value or balance changes, clamp downward.
  useEffect(() => {
    if (loyaltyPoints > maxRedeemable) setLoyaltyPoints(maxRedeemable);
  }, [maxRedeemable, loyaltyPoints]);

  // Tracks an order whose Stripe PaymentIntent has already been authorised.
  // If a post-payment step (confirmOrder) fails, we MUST NOT call createOrder
  // again — that would mint a second order + second PaymentIntent and risk a
  // duplicate charge. Retries only re-run confirmOrder; if even that keeps
  // failing the user is offered a direct link to their tracking page.
  const paidOrderIdRef = useRef<string | null>(null);
  const [paidButUnconfirmed, setPaidButUnconfirmed] = useState<string | null>(null);

  if (tokenLoading || !token || items.length === 0 || !vendor) {
    return <p className="px-4 py-12 text-center text-sm text-mid">Loading checkout&hellip;</p>;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!stripe || !elements) {
      setServerError('Payment system not ready. Please refresh and try again.');
      return;
    }
    if (!scheduledFor) {
      setServerError('Please choose a delivery slot.');
      return;
    }
    if (!isAfter(scheduledFor, new Date())) {
      setServerError('Delivery slot must be in the future.');
      return;
    }

    setSubmitting(true);
    try {
      // FAST PATH: Stripe already authorised payment on a previous attempt
      // that failed during confirmOrder. Don't create another order — just
      // retry the confirm step against the existing one. Side effects must
      // mirror the main success branch exactly (clear basket, drop the
      // discount session key, set has-ordered so the global push prompt
      // surfaces, then redirect) — otherwise a customer who recovered via
      // retry never sees the post-order push opt-in.
      if (paidOrderIdRef.current) {
        await confirmOrder.mutateAsync(paidOrderIdRef.current);
        const id = paidOrderIdRef.current;
        sessionStorage.removeItem('feastpot.discount.v1');
        try {
          localStorage.setItem('feastpot.has-ordered.v1', '1');
        } catch {
          /* ignore — private mode */
        }
        clearBasket();
        router.push(`/orders/${id}/confirmation`);
        return;
      }

      // AddressSelector saves new addresses inline and surfaces the id via
      // onChange, so by the time we get here `selectedAddressId` is either
      // a real saved address or null (mid-edit) — we block in the latter case.
      if (!selectedAddressId) {
        setServerError('Please choose or save a delivery address before placing the order.');
        setSubmitting(false);
        return;
      }
      const deliveryAddressId: string = selectedAddressId;

      // Discount code from basket drawer (sessionStorage).
      const discountCode =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('feastpot.discount.v1') ?? undefined
          : undefined;

      // 1. POST /v1/orders → returns { order, clientSecret }
      const { order, clientSecret } = await createOrder.mutateAsync({
        vendorId: vendor.id,
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          customisationNotes: i.customisationNotes,
        })),
        deliveryAddressId,
        scheduledFor: scheduledFor.toISOString(),
        notes: notes || undefined,
        discountCode,
        loyaltyPointsToRedeem: loyaltyPoints >= 200 ? loyaltyPoints : undefined,
      });

      // 2. Confirm the card payment with Stripe.
      const card = elements.getElement(CardElement);
      if (!card) throw new Error('Card details not entered.');

      const { error: stripeErr, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      });

      if (stripeErr) {
        // Card declined / user cancelled / 3DS failed — no money moved, the
        // existing order can be re-confirmed against on a retry (createOrder
        // is idempotent in spirit because the user hasn't moved on yet).
        // We DO record the orderId so a follow-up doesn't double-create.
        paidOrderIdRef.current = null;
        setServerError(stripeErr.message ?? 'Payment failed.');
        setSubmitting(false);
        return;
      }
      if (
        !paymentIntent ||
        (paymentIntent.status !== 'requires_capture' && paymentIntent.status !== 'succeeded')
      ) {
        // Auth-only (manual capture) PIs land in `requires_capture` after a
        // successful confirm. We accept either to be forward-compatible.
        setServerError(`Unexpected payment status: ${paymentIntent?.status ?? 'unknown'}`);
        setSubmitting(false);
        return;
      }

      // ⚠️ Past this line the customer's card has been authorised. From now on
      // we MUST NOT call createOrder again, even on failure.
      paidOrderIdRef.current = order.id;

      // 3. Tell the API we successfully confirmed.
      await confirmOrder.mutateAsync(order.id);

      // 4. Clear basket + go to confirmation page (which links to tracking).
      //    Mark "has ordered" so the global push-permission prompt can finally
      //    surface — we deliberately wait until the user has real reason to
      //    want order notifications.
      sessionStorage.removeItem('feastpot.discount.v1');
      try {
        localStorage.setItem('feastpot.has-ordered.v1', '1');
      } catch {
        /* ignore */
      }
      clearBasket();
      router.push(`/orders/${order.id}/confirmation`);
    } catch (err) {
      // If we already authorised the card, surface a recovery CTA instead of
      // letting the customer hit "Place order" again.
      if (paidOrderIdRef.current) {
        setPaidButUnconfirmed(paidOrderIdRef.current);
      }
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('Checkout failed. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="px-4 py-4 pb-32 space-y-5" noValidate>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-dark">Checkout</h1>
        <p className="text-sm text-mid">Ordering from {vendor.name}</p>
      </header>

      {/* SECTION 1 — ORDER SUMMARY (collapsible) */}
      <Section title="Order summary">
        <div className="overflow-hidden rounded-2xl bg-surface">
          <button
            type="button"
            onClick={() => setSummaryOpen((o) => !o)}
            aria-expanded={summaryOpen}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-mid">
              <span className="font-semibold text-dark">{itemCount} item{itemCount === 1 ? '' : 's'}</span>
              {' · '}
              <span className="truncate">{vendor.name}</span>
              {' · '}
              <span className="font-semibold text-dark">{formatPounds(subtotal)}</span>
            </span>
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 text-mid transition-transform', summaryOpen && 'rotate-180')}
              aria-hidden
            />
          </button>
          {summaryOpen && (
            <div className="border-t border-border/60 bg-white px-4 py-3 text-sm">
              <ul className="space-y-1.5">
                {items.map((i) => (
                  <li key={i.lineId} className="flex justify-between gap-2 text-mid">
                    <span className="min-w-0">
                      <span className="text-dark">{i.quantity}× {i.menuItemName}</span>
                      {i.customisationNotes && (
                        <span className="block truncate text-[11px] italic text-mid">
                          &ldquo;{i.customisationNotes}&rdquo;
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-dark">{formatPounds(i.lineTotalPence)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm">
                <span className="text-mid">Subtotal</span>
                <span className="font-semibold tabular-nums text-dark">{formatPounds(subtotal)}</span>
              </div>
              <p className="mt-1 text-[11px] text-mid">
                Delivery, service fees and any discounts are calculated at order placement.
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* SECTION 1b — LOYALTY POINTS REDEMPTION */}
      {(loyalty?.balance ?? 0) >= 200 && (
        <Section title="Loyalty points">
          <div className="rounded-2xl border border-border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-dark">
                  You have{' '}
                  <span className="font-semibold text-teal">
                    {loyalty!.balance.toLocaleString()} pts
                  </span>{' '}
                  ({formatPounds(loyalty!.worthPence)})
                </p>
                <p className="text-[11px] text-mid">1 point = 1p · 200pt minimum · max {maxRedeemable.toLocaleString()}pt</p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLoyaltyPoints(Math.max(0, loyaltyPoints - 100))}
                disabled={loyaltyPoints <= 0}
                className="h-10 w-10 rounded-full border border-border text-lg font-semibold text-dark hover:bg-surface disabled:opacity-40"
                aria-label="Redeem fewer points"
              >
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                step={100}
                min={0}
                max={maxRedeemable}
                value={loyaltyPoints}
                onChange={(e) => {
                  const n = Math.max(0, Math.min(maxRedeemable, Math.floor(Number(e.target.value) / 100) * 100));
                  setLoyaltyPoints(Number.isFinite(n) ? n : 0);
                }}
                className="h-10 flex-1 rounded-xl border border-border bg-white px-3 text-center text-base font-semibold tabular-nums text-dark focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setLoyaltyPoints(Math.min(maxRedeemable, loyaltyPoints + 100))}
                disabled={loyaltyPoints >= maxRedeemable}
                className="h-10 w-10 rounded-full border border-border text-lg font-semibold text-dark hover:bg-surface disabled:opacity-40"
                aria-label="Redeem more points"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setLoyaltyPoints(maxRedeemable)}
                disabled={loyaltyPoints === maxRedeemable || maxRedeemable === 0}
                className="h-10 rounded-xl bg-teal px-3 text-xs font-semibold text-white hover:bg-teal/90 disabled:opacity-40"
              >
                Max
              </button>
            </div>

            {loyaltyPoints >= 200 ? (
              <p className="mt-2 text-xs text-teal">
                −{formatPounds(loyaltyPoints)} discount applied
              </p>
            ) : loyaltyPoints > 0 ? (
              <p className="mt-2 text-xs text-mid">Redeem at least 200pt to apply a discount.</p>
            ) : null}
          </div>
        </Section>
      )}

      {/* SECTION 2 — DELIVERY ADDRESS */}
      <Section title="Delivery address">
        <AddressSelector value={selectedAddressId} onChange={setSelectedAddressId} />
      </Section>

      {/* SECTION 3 — DELIVERY SLOT */}
      <Section title="Delivery slot">
        <SlotPicker
          // The vendor DeliveryConfig schema does NOT yet expose the
          // open/close hours, lead time, or weekly availability per vendor —
          // until it does, we hand SlotPicker app-wide defaults. The
          // component is shaped against the future per-vendor API so we
          // only need to update this call site when the fields land.
          availableDays={[0, 1, 2, 3, 4, 5, 6]}
          slotOpenTime="11:00"
          slotCloseTime="20:00"
          leadTimeHours={2}
          maxAdvanceDays={6}
          value={scheduledFor}
          onChange={setScheduledFor}
        />
        {scheduledFor && (
          <p className="mt-2 inline-block rounded-full bg-teal/10 px-3 py-1 text-xs font-medium text-teal-dark">
            {scheduledFor.toLocaleString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </Section>

      {/* SECTION 4 — ORDER NOTES */}
      <Section title="Order notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Any customisation, spice adjustments, or gate codes"
          className="w-full rounded-2xl border border-border bg-white px-3 py-2.5 text-sm placeholder:text-mid focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <p className="mt-1 text-right text-[11px] text-mid">{notes.length}/1000</p>
      </Section>

      {/* SECTION 5 — PAYMENT */}
      <section ref={paymentSectionRef} className="space-y-3">
        <h2 className="text-base font-semibold text-dark">Payment</h2>

        {/* Apple/Google Pay placeholder. PaymentRequestButton needs a verified
            Stripe domain + a server-side PR setup; until that lands we render
            a disabled affordance so the visual order matches the brief. */}
        <button
          type="button"
          disabled
          aria-disabled
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-dark text-sm font-semibold text-white opacity-60"
          title="Apple/Google Pay coming soon"
        >
          Apple Pay / Google Pay — coming soon
        </button>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] uppercase tracking-wider text-mid">or pay by card</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="rounded-2xl border border-border bg-white p-3">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>

        {/* Trust row */}
        <ul className="flex items-center justify-center gap-3 text-[11px] text-mid">
          <li className="inline-flex items-center gap-1">
            <Lock className="h-3 w-3" aria-hidden /> 256-bit SSL
          </li>
          <li className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" aria-hidden /> Stripe secured
          </li>
          <li className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" aria-hidden /> Money-back guarantee
          </li>
        </ul>
      </section>

      {serverError && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {serverError}
        </p>
      )}

      {paidButUnconfirmed && (
        <div className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Your payment was authorised.</p>
          <p>
            We had trouble finalising the order with the kitchen. Tap retry — we&rsquo;ll only
            re-confirm the existing order, never charge you again.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/orders/${paidButUnconfirmed}/tracking`)}
            className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            View your order
          </button>
        </div>
      )}

      {/* Inline place-order button (the primary one customers tap before
          they've scrolled to reveal the sticky bar). */}
      <button
        type="submit"
        disabled={submitting || !stripe || !selectedAddressId || !scheduledFor}
        className="flex w-full items-center justify-center rounded-2xl bg-brand text-base font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        style={{ height: 52 }}
      >
        {submitting
          ? 'Placing order…'
          : paidOrderIdRef.current
            ? 'Retry confirming order'
            : `Place order · ${formatPounds(subtotal)}`}
      </button>

      {/* STICKY BOTTOM — appears once the payment section is in view so the
          customer can submit without scrolling back up. Sits ABOVE the
          BottomNav (which is 64px tall + safe-area). */}
      {showStickyBar && (
        <div
          className="fixed inset-x-0 z-30 border-t border-border bg-white/95 px-4 py-3 backdrop-blur"
          style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-mid">Total</p>
              <p className="text-lg font-bold tabular-nums text-dark">{formatPounds(subtotal)}</p>
            </div>
            <button
              type="submit"
              disabled={submitting || !stripe || !selectedAddressId || !scheduledFor}
              className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-brand text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {submitting ? 'Placing…' : 'Place order →'}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-dark">{title}</h2>
      {children}
    </section>
  );
}

const CARD_ELEMENT_OPTIONS: StripeCardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1c1c1a',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      '::placeholder': { color: '#9b9b97' },
    },
    invalid: { color: '#dc2626' },
  },
};
