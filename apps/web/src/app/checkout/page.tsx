'use client';

import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeCardElementOptions } from '@stripe/stripe-js';
import { addDays, format, isAfter, set, startOfDay } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AddressSelector } from '@/components/address/address-selector';
import { PageShell } from '@/components/layout/page-shell';
import { useConfirmOrder, useCreateOrder } from '@/hooks/use-orders';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { ApiError } from '@/lib/api/client';
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
      <PageShell>
        <section className="space-y-3 py-12 text-center">
          <h1 className="text-xl font-semibold">Checkout unavailable</h1>
          <p className="text-sm text-muted-foreground">
            Payments aren&rsquo;t configured for this environment yet
            (<code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> is missing).
          </p>
        </section>
      </PageShell>
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

  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Tracks an order whose Stripe PaymentIntent has already been authorised.
  // If a post-payment step (confirmOrder) fails, we MUST NOT call createOrder
  // again — that would mint a second order + second PaymentIntent and risk a
  // duplicate charge. Retries only re-run confirmOrder; if even that keeps
  // failing the user is offered a direct link to their tracking page.
  const paidOrderIdRef = useRef<string | null>(null);
  const [paidButUnconfirmed, setPaidButUnconfirmed] = useState<string | null>(null);

  if (tokenLoading || !token || items.length === 0 || !vendor) {
    return (
      <PageShell>
        <p className="py-12 text-center text-sm text-muted-foreground">Loading checkout&hellip;</p>
      </PageShell>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!stripe || !elements) {
      setServerError('Payment system not ready. Please refresh and try again.');
      return;
    }

    // Build scheduledFor from date + time.
    if (!scheduledDate || !scheduledTime) {
      setServerError('Please choose a delivery slot.');
      return;
    }
    const [h, m] = scheduledTime.split(':').map(Number);
    const scheduledFor = set(new Date(scheduledDate), { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
    if (!isAfter(scheduledFor, new Date())) {
      setServerError('Delivery slot must be in the future.');
      return;
    }

    setSubmitting(true);
    try {
      // FAST PATH: Stripe already authorised payment on a previous attempt
      // that failed during confirmOrder. Don't create another order — just
      // retry the confirm step against the existing one.
      if (paidOrderIdRef.current) {
        await confirmOrder.mutateAsync(paidOrderIdRef.current);
        const id = paidOrderIdRef.current;
        sessionStorage.removeItem('feastpot.discount.v1');
        clearBasket();
        router.push(`/orders/${id}/tracking`);
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
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('feastpot.discount.v1') ?? undefined : undefined;

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
      if (!paymentIntent || (paymentIntent.status !== 'requires_capture' && paymentIntent.status !== 'succeeded')) {
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

      // 4. Clear basket + go to tracking. Mark "has ordered" so the push
      //    permission prompt can finally surface — we deliberately wait
      //    until the user has real reason to want order notifications.
      sessionStorage.removeItem('feastpot.discount.v1');
      try {
        localStorage.setItem('feastpot.has-ordered.v1', '1');
      } catch {
        /* ignore */
      }
      clearBasket();
      router.push(`/orders/${order.id}/tracking`);
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

  // Pre-compute the next 7 days for the date picker. Slot times are 11:00–20:00
  // hourly (vendor open/close times aren't surfaced via the API today; once
  // they are we'll filter against `vendor.deliveryConfig.slots`).
  const dateOptions = Array.from({ length: 7 }).map((_, i) => {
    const d = addDays(startOfDay(new Date()), i);
    return { value: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE d MMM') };
  });
  const timeOptions = Array.from({ length: 10 }).map((_, i) => {
    const h = 11 + i;
    return { value: `${h.toString().padStart(2, '0')}:00`, label: `${h}:00 – ${h + 1}:00` };
  });

  return (
    <PageShell>
      <form onSubmit={onSubmit} className="space-y-6 py-4" noValidate>
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
          <p className="text-sm text-muted-foreground">Ordering from {vendor.name}</p>
        </header>

        {/* STEP 1 — Delivery address */}
        <Step n={1} title="Delivery address">
          <AddressSelector value={selectedAddressId} onChange={setSelectedAddressId} />
        </Step>

        {/* STEP 2 — Delivery slot */}
        <Step n={2} title="Delivery slot">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date">
              <select value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className={inputCls}>
                <option value="">Choose a day</option>
                {dateOptions.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Time slot">
              <select
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className={inputCls}
                disabled={!scheduledDate}
              >
                <option value="">Choose a time</option>
                {timeOptions.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>
          {scheduledDate && scheduledTime && (
            <p className="mt-2 inline-block rounded-full bg-teal-light px-3 py-1 text-xs text-teal-dark">
              {format(new Date(scheduledDate), 'EEEE')} {scheduledTime}–
              {`${(parseInt(scheduledTime.split(':')[0] ?? '0', 10) + 1).toString().padStart(2, '0')}:00`}
            </p>
          )}
        </Step>

        {/* STEP 3 — Order notes */}
        <Step n={3} title="Order notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Any special requests, spice level adjustments, or allergen notes"
            className={`${inputCls} min-h-20`}
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">{notes.length}/1000</p>
        </Step>

        {/* STEP 4 — Payment */}
        <Step n={4} title="Payment">
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-background p-3">
              <CardElement options={CARD_ELEMENT_OPTIONS} />
            </div>
            <p className="text-xs text-muted-foreground">
              Apple Pay / Google Pay via PaymentRequestButton: requires a verified Stripe domain
              and a checkout-session-side payment-request setup. Card payments work today; mobile
              wallets to follow.
            </p>
          </div>
        </Step>

        {/* Order summary */}
        <section className="rounded-lg border border-border p-3 text-sm">
          <h3 className="font-semibold">Order summary</h3>
          <ul className="mt-2 space-y-1">
            {items.map((i) => (
              <li key={i.lineId} className="flex justify-between text-muted-foreground">
                <span>{i.quantity}× {i.menuItemName}</span>
                <span>{formatPounds(i.lineTotalPence)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-border pt-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatPounds(subtotal)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Delivery, service fees and discounts are calculated by Feastpot at order placement.
            </p>
          </div>
        </section>

        {serverError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </p>
        )}

        {paidButUnconfirmed && (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Your payment was authorised.</p>
            <p>
              We had trouble finalising the order with the kitchen. Tap retry — we&rsquo;ll only re-confirm the
              existing order, never charge you again.
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

        <button
          type="submit"
          disabled={submitting || !stripe || !selectedAddressId}
          className="w-full rounded-md bg-brand py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {submitting
            ? 'Placing order…'
            : paidOrderIdRef.current
              ? 'Retry confirming order'
              : 'Place order'}
        </button>
      </form>
    </PageShell>
  );
}

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
    </label>
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
