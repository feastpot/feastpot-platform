'use client';

import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeCardElementOptions } from '@stripe/stripe-js';
import { useQuery } from '@tanstack/react-query';
import { isAfter } from 'date-fns';
import { ChevronDown, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@feastpot/ui';

import { AddressSelector } from '@/components/address/address-selector';
import {
  AppleGooglePayButton,
  type ExpressPayComplete,
} from '@/components/checkout/payment-request-button';
import { SlotPicker } from '@/components/checkout/slot-picker';
import { PanelTitle } from '@/components/ui/wireframe';
import { CoverageBadge } from '@/components/vendor/coverage-badge';
import { useAddresses } from '@/hooks/use-addresses';
import { useLoyalty } from '@/hooks/use-loyalty';
import { useConfirmOrder, useCreateOrder } from '@/hooks/use-orders';
import { ApiError, apiRequest } from '@/lib/api/client';
import { evaluateDeliveryCoverage } from '@/lib/api/coverage';
import { getVendorBySlug } from '@/lib/api/vendors';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { STRIPE_CONFIGURED, getStripe } from '@/lib/stripe';
import { useBasketStore } from '@/store/basket.store';

const KM_PER_MILE = 0.621371;

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;
const pad2 = (n: number): string => n.toString().padStart(2, '0');

/**
 * Auth-gated checkout. Middleware already redirects `/account/*` but the
 * checkout route lives outside that prefix, so we double-check here and
 * bounce to /sign-in?next=/checkout if the session went away.
 *
 * Stripe Elements MUST be mounted under <Elements>. We initialise the Stripe
 * promise once via `getStripe()` (returns null if NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 * isn't set - the page then renders a clear "Stripe not configured" notice
 * rather than a broken card form).
 */
export default function CheckoutPage() {
  const stripePromise = useMemo(() => getStripe(), []);

  if (!STRIPE_CONFIGURED) {
    return (
      <div className="px-4 py-12 text-center space-y-3">
        <h1 className="font-display text-xl font-black text-charcoal">Checkout unavailable</h1>
        <p className="text-sm font-medium text-charcoal-mid">
          Payments aren&rsquo;t configured for this environment yet
          (<code className="rounded bg-cream px-1 py-0.5 text-xs">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> is missing).
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

  // Vendor availability snapshot (T002) drives the SlotPicker:
  // opening days, hours, prep lead, blackouts, same-day toggle. Falls
  // back to sensible defaults while loading so the picker is never
  // empty - the API re-validates on submit regardless, so a stale
  // local guess can't take an unavailable order through.
  const { data: availability } = useQuery({
    queryKey: ['vendor', 'availability', vendor?.id],
    enabled: !!vendor?.id,
    staleTime: 60_000,
    queryFn: () =>
      apiRequest<{
        openingDays: number[];
        slotOpenHour: number;
        slotCloseHour: number;
        prepLeadHours: number;
        sameDayOrders: boolean;
        blackoutDates: { id: string; date: string; reason: string | null }[];
      }>(`/vendors/${vendor!.id}/availability`),
  });
  const [notes, setNotes] = useState<string>('');

  // Delivery coverage (proactive UX guard). The server is the source of truth
  // and will reject an out-of-area order before any charge, but we also check
  // up-front so the customer isn't surprised at submit time. We resolve the
  // selected address's postcode, then ask the public vendor endpoint for the
  // server-computed haversine distance to it - no client geocoding, and no
  // home-cook coordinates ever reach the browser.
  const { data: addresses } = useAddresses();
  const selectedAddress = addresses?.find((a) => a.id === selectedAddressId) ?? null;
  const selectedPostcode = selectedAddress?.postcode ?? null;

  const { data: coverageVendor } = useQuery({
    queryKey: ['vendor', 'coverage', vendor?.slug, selectedPostcode],
    enabled: Boolean(vendor?.slug && selectedPostcode),
    staleTime: 60_000,
    queryFn: () => getVendorBySlug(vendor!.slug, { postcode: selectedPostcode! }),
  });

  const coverageRadiusMiles = coverageVendor?.delivery?.localRadiusMiles ?? null;
  const coverageDistanceMiles =
    typeof coverageVendor?.distanceKm === 'number' ? coverageVendor.distanceKm * KM_PER_MILE : null;
  const coverageVerdict = evaluateDeliveryCoverage(coverageDistanceMiles, coverageRadiusMiles);
  const outsideDeliveryArea = coverageVerdict.state === 'outside';

  // Order-summary collapse state. We START open so the customer can verify
  // the items, then they can collapse it once they've reviewed. Auto-collapse
  // after 3.5s on mount nudges them to scroll into the rest of the form.
  const [summaryOpen, setSummaryOpen] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSummaryOpen(false), 3500);
    return () => clearTimeout(t);
  }, []);

  // Sticky bottom bar visibility - appears once the payment section enters
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

  // Loyalty redemption (FR-LOY-001). Cap by balance only - backend caps
  // the redemption against (subtotal + delivery − promo) and we don't
  // know the server-side delivery fee here, so capping by subtotal alone
  // would under-state the true max. Floor to a multiple of 100 so the
  // stepper buttons stay sensible. Actual discount is recomputed server-side.
  const { data: loyalty } = useLoyalty();
  const [loyaltyPoints, setLoyaltyPoints] = useState<number>(0);
  const maxRedeemable = Math.floor((loyalty?.balance ?? 0) / 100) * 100;
  // If basket value or balance changes, clamp downward.
  useEffect(() => {
    if (loyaltyPoints > maxRedeemable) setLoyaltyPoints(maxRedeemable);
  }, [maxRedeemable, loyaltyPoints]);

  // Tracks an order whose Stripe PaymentIntent has already been authorised.
  // If a post-payment step (confirmOrder) fails, we MUST NOT call createOrder
  // again - that would mint a second order + second PaymentIntent and risk a
  // duplicate charge. Retries only re-run confirmOrder; if even that keeps
  // failing the user is offered a direct link to their tracking page.
  const paidOrderIdRef = useRef<string | null>(null);
  const [paidButUnconfirmed, setPaidButUnconfirmed] = useState<string | null>(null);

  // A discount code's value is computed server-side and never reaches the
  // client, so we cannot show an exact total for express checkout when one is
  // applied - those orders fall back to the card form (which lets the server
  // own the discount maths). Captured at mount; the code is set in the basket
  // drawer before checkout loads, so it's stable for this session.
  const [discountCodeApplied] = useState(() =>
    typeof window !== 'undefined' ? Boolean(sessionStorage.getItem('feastpot.discount.v1')) : false,
  );

  // Express checkout (Apple/Google Pay) total. The native wallet sheet shows
  // this figure BEFORE the customer authorises, so it MUST equal the amount we
  // charge. We can derive it on the client: delivery pricing is exposed via
  // coverageVendor, the service fee mirrors the server's bps, and loyalty is
  // local state. The order on the server is: subtotal + delivery + service −
  // discount, clamped at 0, with loyalty capped against (subtotal + delivery).
  const expressDelivery = coverageVendor?.delivery ?? null;
  const expressDeliveryType = expressDelivery?.types?.[0] ?? 'local';
  const expressDeliveryFeePence =
    !expressDelivery || expressDeliveryType !== 'local'
      ? null // nationwide fee isn't exposed client-side → can't show express pay safely
      : expressDelivery.freeDeliveryOverPence != null &&
          subtotal >= expressDelivery.freeDeliveryOverPence
        ? 0
        : expressDelivery.localFeePence;
  // Service-fee bps comes from the vendor profile response, which the API reads
  // from SERVICE_FEE_BPS at REQUEST time - the same runtime source the order
  // charge uses. This keeps the wallet-sheet total in lockstep with the charge
  // (no build-time env mirror to drift). `undefined` means an API that predates
  // the field, in which case we withhold express pay below rather than guess.
  const platformServiceFeeBps = coverageVendor?.platformServiceFeeBps;
  const expressServiceFeePence = Math.round((subtotal * (platformServiceFeeBps ?? 0)) / 10_000);
  const expressLoyaltyPence =
    expressDeliveryFeePence == null
      ? 0
      : Math.min(loyaltyPoints >= 200 ? loyaltyPoints : 0, subtotal + expressDeliveryFeePence);
  const expressTotalPence =
    expressDeliveryFeePence == null
      ? 0
      : Math.max(
          0,
          subtotal + expressDeliveryFeePence + expressServiceFeePence - expressLoyaltyPence,
        );
  // Only offer express pay once the order is actually placeable and the exact
  // total is knowable (delivery pricing loaded, no opaque discount code).
  const expressPayReady =
    !discountCodeApplied &&
    !paidButUnconfirmed &&
    expressDeliveryFeePence != null &&
    platformServiceFeeBps != null &&
    expressTotalPence > 0 &&
    Boolean(selectedAddressId) &&
    Boolean(scheduledFor) &&
    !outsideDeliveryArea;

  if (tokenLoading || !token || items.length === 0 || !vendor) {
    return (
      <p className="px-4 py-12 text-center text-sm font-medium text-charcoal-mid">
        Loading checkout&hellip;
      </p>
    );
  }

  // Shared post-confirmation side effects. Clearing the discount key, setting
  // the has-ordered flag (so the global push-permission prompt can surface),
  // emptying the basket, and redirecting must happen identically for card and
  // express-pay success - factoring it here keeps the two flows from drifting.
  const finalizeOrderSuccess = (orderId: string) => {
    sessionStorage.removeItem('feastpot.discount.v1');
    try {
      localStorage.setItem('feastpot.has-ordered.v1', '1');
    } catch {
      /* ignore - private mode */
    }
    clearBasket();
    router.push(`/orders/${orderId}/confirmation`);
  };

  // Apple Pay / Google Pay express checkout. Mirrors the card flow's order →
  // PaymentIntent → confirm → finalize sequence, but the payment method comes
  // from the wallet sheet. We confirm with handleActions:false so we can
  // dismiss the native sheet (via `complete`) BEFORE running any 3DS step,
  // which Stripe requires.
  const handleExpressPay = async (paymentMethodId: string, complete: ExpressPayComplete) => {
    setServerError(null);

    // Fast path: a previous attempt already authorised payment but the confirm
    // step failed. NEVER create a second order/charge - just retry the confirm
    // and dismiss the wallet sheet. The express button is normally hidden in
    // this state (expressPayReady gates on !paidButUnconfirmed); this guard is
    // belt-and-suspenders in case the sheet was already open.
    if (paidOrderIdRef.current) {
      try {
        await confirmOrder.mutateAsync(paidOrderIdRef.current);
        complete('success');
        finalizeOrderSuccess(paidOrderIdRef.current);
      } catch (err) {
        complete('fail');
        setPaidButUnconfirmed(paidOrderIdRef.current);
        setServerError(err instanceof Error ? err.message : 'Could not finalise your order.');
      }
      return;
    }

    if (!stripe) {
      complete('fail');
      setServerError('Payment system not ready. Please refresh and try again.');
      return;
    }
    if (!selectedAddressId) {
      complete('fail');
      setServerError('Please choose or save a delivery address before paying.');
      return;
    }
    if (!scheduledFor || !isAfter(scheduledFor, new Date())) {
      complete('fail');
      setServerError('Please choose a delivery slot in the future.');
      return;
    }
    if (outsideDeliveryArea) {
      complete('fail');
      setServerError(`${vendor.name} doesn't deliver to this address. Please choose a closer one.`);
      return;
    }

    setSubmitting(true);
    try {
      const discountCode =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('feastpot.discount.v1') ?? undefined
          : undefined;

      const { order, clientSecret } = await createOrder.mutateAsync({
        vendorId: vendor.id,
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          customisationNotes: i.customisationNotes,
        })),
        deliveryAddressId: selectedAddressId,
        scheduledFor: scheduledFor.toISOString(),
        notes: notes || undefined,
        discountCode,
        loyaltyPointsToRedeem: loyaltyPoints >= 200 ? loyaltyPoints : undefined,
      });

      const { error: stripeErr, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: paymentMethodId },
        { handleActions: false },
      );

      if (stripeErr) {
        // No money moved - dismiss the sheet and let the customer retry. We do
        // NOT set paidOrderIdRef so a retry can re-create cleanly.
        complete('fail');
        paidOrderIdRef.current = null;
        setServerError(stripeErr.message ?? 'Payment failed.');
        setSubmitting(false);
        return;
      }

      // Dismiss the wallet sheet, THEN handle any required 3DS step.
      complete('success');

      let pi = paymentIntent;
      if (pi && pi.status === 'requires_action') {
        // Past this point the card may have been authorised on the retry, so
        // mark the order as paid-but-unconfirmed if anything downstream fails.
        paidOrderIdRef.current = order.id;
        const next = await stripe.confirmCardPayment(clientSecret);
        if (next.error) {
          setPaidButUnconfirmed(order.id);
          setServerError(next.error.message ?? 'Payment authentication failed.');
          setSubmitting(false);
          return;
        }
        pi = next.paymentIntent;
      }

      if (!pi || (pi.status !== 'requires_capture' && pi.status !== 'succeeded')) {
        setServerError(`Unexpected payment status: ${pi?.status ?? 'unknown'}`);
        setSubmitting(false);
        return;
      }

      // ⚠️ Card authorised - never call createOrder again for this attempt.
      paidOrderIdRef.current = order.id;
      await confirmOrder.mutateAsync(order.id);
      finalizeOrderSuccess(order.id);
    } catch (err) {
      complete('fail'); // no-op if the sheet was already dismissed
      if (paidOrderIdRef.current) setPaidButUnconfirmed(paidOrderIdRef.current);
      if (err instanceof ApiError) setServerError(err.message);
      else if (err instanceof Error) setServerError(err.message);
      else setServerError('Checkout failed. Please try again.');
      setSubmitting(false);
    }
  };

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
      // that failed during confirmOrder. Don't create another order - just
      // retry the confirm step against the existing one. Side effects must
      // mirror the main success branch exactly (clear basket, drop the
      // discount session key, set has-ordered so the global push prompt
      // surfaces, then redirect) - otherwise a customer who recovered via
      // retry never sees the post-order push opt-in.
      if (paidOrderIdRef.current) {
        await confirmOrder.mutateAsync(paidOrderIdRef.current);
        finalizeOrderSuccess(paidOrderIdRef.current);
        return;
      }

      // AddressSelector saves new addresses inline and surfaces the id via
      // onChange, so by the time we get here `selectedAddressId` is either
      // a real saved address or null (mid-edit) - we block in the latter case.
      if (!selectedAddressId) {
        setServerError('Please choose or save a delivery address before placing the order.');
        setSubmitting(false);
        return;
      }
      const deliveryAddressId: string = selectedAddressId;

      // Out-of-area guard. The server enforces this too (and rejects before
      // any charge), but blocking here avoids a pointless round-trip and gives
      // an instant, specific message.
      if (outsideDeliveryArea) {
        setServerError(
          `${vendor.name} delivers within ${coverageRadiusMiles} miles, but this address is ${coverageDistanceMiles?.toFixed(1)} miles away. Please choose a closer address.`,
        );
        setSubmitting(false);
        return;
      }

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
        // Card declined / user cancelled / 3DS failed - no money moved, the
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
      //    surface - we deliberately wait until the user has real reason to
      //    want order notifications.
      finalizeOrderSuccess(order.id);
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
        <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
          Checkout
        </h1>
        <p className="text-sm font-medium text-charcoal-mid">
          Ordering from <span className="font-bold text-brand">{vendor.name}</span>
        </p>
      </header>

      {/* SECTION 1 - ORDER SUMMARY (collapsible) */}
      <Section num={1} title="Order summary">
        <div className="overflow-hidden rounded-2xl border border-cream-deep bg-white">
          <button
            type="button"
            onClick={() => setSummaryOpen((o) => !o)}
            aria-expanded={summaryOpen}
            className="flex w-full items-center justify-between gap-3 bg-cream px-4 py-3 text-left text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-charcoal-mid">
              <span className="font-bold text-charcoal">{itemCount} item{itemCount === 1 ? '' : 's'}</span>
              {' · '}
              <span className="truncate">{vendor.name}</span>
              {' · '}
              <span className="font-bold text-charcoal">{formatPounds(subtotal)}</span>
            </span>
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 text-charcoal-mid transition-transform', summaryOpen && 'rotate-180')}
              aria-hidden
            />
          </button>
          {summaryOpen && (
            <div className="border-t border-cream-deep bg-white px-4 py-3 text-sm">
              <ul className="space-y-1.5">
                {items.map((i) => (
                  <li key={i.lineId} className="flex justify-between gap-2 text-charcoal-mid">
                    <span className="min-w-0">
                      <span className="font-medium text-charcoal">{i.quantity}× {i.menuItemName}</span>
                      {i.customisationNotes && (
                        <span className="block truncate text-[11px] italic text-charcoal-mid">
                          &ldquo;{i.customisationNotes}&rdquo;
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-charcoal">{formatPounds(i.lineTotalPence)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-cream-deep pt-2 text-sm">
                <span className="text-charcoal-mid">Subtotal</span>
                <span className="font-bold tabular-nums text-charcoal">{formatPounds(subtotal)}</span>
              </div>
              <p className="mt-1 text-[11px] font-medium text-charcoal-mid">
                Delivery, service fees and any discounts are calculated at order placement.
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* SECTION 1b - LOYALTY POINTS REDEMPTION */}
      {(loyalty?.balance ?? 0) >= 200 && (
        <Section num={2} title="Loyalty points">
          <div className="rounded-2xl border border-plantain/40 bg-plantain/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-charcoal">
                  You have{' '}
                  <span className="font-black text-charcoal">
                    {loyalty!.balance.toLocaleString()} pts
                  </span>{' '}
                  ({formatPounds(loyalty!.worthPence)})
                </p>
                <p className="text-[11px] font-medium text-charcoal-mid">
                  1 point = 1p · 200pt minimum · max {maxRedeemable.toLocaleString()}pt
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLoyaltyPoints(Math.max(0, loyaltyPoints - 100))}
                disabled={loyaltyPoints <= 0}
                className="h-10 w-10 rounded-full border border-cream-deep bg-white text-lg font-bold text-charcoal hover:bg-cream disabled:opacity-40"
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
                className="h-10 flex-1 rounded-xl border border-cream-deep bg-white px-3 text-center text-base font-bold tabular-nums text-charcoal focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setLoyaltyPoints(Math.min(maxRedeemable, loyaltyPoints + 100))}
                disabled={loyaltyPoints >= maxRedeemable}
                className="h-10 w-10 rounded-full border border-cream-deep bg-white text-lg font-bold text-charcoal hover:bg-cream disabled:opacity-40"
                aria-label="Redeem more points"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setLoyaltyPoints(maxRedeemable)}
                disabled={loyaltyPoints === maxRedeemable || maxRedeemable === 0}
                className="h-10 rounded-xl bg-brand px-3 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-40"
              >
                Max
              </button>
            </div>

            {loyaltyPoints >= 200 ? (
              <p className="mt-2 text-xs font-bold text-brand-dark">
                −{formatPounds(loyaltyPoints)} discount applied
              </p>
            ) : loyaltyPoints > 0 ? (
              <p className="mt-2 text-xs font-medium text-charcoal-mid">
                Redeem at least 200pt to apply a discount.
              </p>
            ) : null}
          </div>
        </Section>
      )}

      {/* SECTION 2 - DELIVERY ADDRESS */}
      <Section num={3} title="Delivery address">
        <AddressSelector value={selectedAddressId} onChange={setSelectedAddressId} />

        {/* Coverage status for the chosen address. Server stays the source of
            truth; this is a fast, friendly heads-up. */}
        {selectedPostcode && coverageVerdict.state !== 'unknown' && (
          <div>
            <CoverageBadge
              distanceMiles={coverageDistanceMiles}
              radiusMiles={coverageRadiusMiles}
              hasPostcode
            />
          </div>
        )}

        {outsideDeliveryArea && (
          <div className="rounded-2xl border border-plantain bg-plantain/15 p-3 text-sm text-charcoal">
            <p className="font-display font-black">Outside {vendor.name}&rsquo;s delivery area</p>
            <p className="mt-1 font-medium text-charcoal-mid">
              This kitchen delivers within {coverageRadiusMiles} miles, but this address is{' '}
              {coverageDistanceMiles?.toFixed(1)} miles away. Choose a closer saved address to
              continue.
            </p>
          </div>
        )}
      </Section>

      {/* SECTION 3 - DELIVERY SLOT */}
      <Section num={4} title="Delivery slot">
        <SlotPicker
          availableDays={availability?.openingDays ?? [0, 1, 2, 3, 4, 5, 6]}
          slotOpenTime={`${pad2(availability?.slotOpenHour ?? 11)}:00`}
          slotCloseTime={`${pad2(availability?.slotCloseHour ?? 20)}:00`}
          leadTimeHours={availability?.prepLeadHours ?? 2}
          maxAdvanceDays={13}
          blackoutDates={availability?.blackoutDates.map((b) => b.date) ?? []}
          allowSameDay={availability?.sameDayOrders ?? true}
          value={scheduledFor}
          onChange={setScheduledFor}
        />
        {scheduledFor && (
          <p className="mt-2 inline-block rounded-full bg-brand-light px-3 py-1 text-xs font-bold text-brand-dark">
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

      {/* SECTION 4 - ORDER NOTES */}
      <Section num={5} title="Order notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Any customisation, spice adjustments, or gate codes"
          className="w-full rounded-2xl border border-cream-deep bg-white px-3 py-2.5 text-sm text-charcoal placeholder:text-charcoal-mid focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <p className="mt-1 text-right text-[11px] font-medium text-charcoal-mid">
          {notes.length}/1000
        </p>
      </Section>

      {/* SECTION 5 - PAYMENT */}
      <section ref={paymentSectionRef} className="space-y-3">
        <h2 className="font-display text-base font-black text-charcoal">Payment</h2>

        {/* Apple Pay / Google Pay express checkout. Renders only on devices
            with an enrolled wallet AND once the exact total is knowable; the
            component itself returns null otherwise, leaving the card form as
            the sole option (the correct fallback - no "not supported" notice).
            Includes its own "or pay by card" divider when shown. */}
        {expressPayReady && (
          <AppleGooglePayButton
            totalPence={expressTotalPence}
            label={`Feastpot · ${vendor.name}`}
            disabled={submitting}
            onPaymentMethod={handleExpressPay}
          />
        )}

        <div className="rounded-2xl border border-cream-deep bg-white p-3">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>

        {/* Trust row */}
        <ul className="flex items-center justify-center gap-3 text-[11px] font-medium text-charcoal-mid">
          <li className="inline-flex items-center gap-1">
            <Lock className="h-3 w-3 text-brand" aria-hidden /> 256-bit SSL
          </li>
          <li className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-brand" aria-hidden /> Stripe secured
          </li>
          <li className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-brand" aria-hidden /> Money-back guarantee
          </li>
        </ul>
      </section>

      {serverError && (
        <p className="rounded-2xl border border-scotch/30 bg-scotch/10 p-3 text-sm font-medium text-scotch">
          {serverError}
        </p>
      )}

      {paidButUnconfirmed && (
        <div className="space-y-2 rounded-2xl border border-plantain bg-plantain/15 p-3 text-sm text-charcoal">
          <p className="font-display font-black">Your payment was authorised.</p>
          <p className="font-medium text-charcoal-mid">
            We had trouble finalising the order with the kitchen. Tap retry - we&rsquo;ll only
            re-confirm the existing order, never charge you again.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/orders/${paidButUnconfirmed}/tracking`)}
            className="rounded-xl border border-plantain bg-white px-3 py-1.5 text-xs font-bold text-charcoal hover:bg-plantain/10"
          >
            View your order
          </button>
        </div>
      )}

      {/* Inline place-order button (the primary one customers tap before
          they've scrolled to reveal the sticky bar). */}
      <button
        type="submit"
        disabled={submitting || !stripe || !selectedAddressId || !scheduledFor || outsideDeliveryArea}
        className="flex w-full items-center justify-center rounded-2xl bg-brand text-base font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:opacity-50"
        style={{ height: 52 }}
      >
        {submitting
          ? 'Placing order…'
          : paidOrderIdRef.current
            ? 'Retry confirming order'
            : `Place order · ${formatPounds(subtotal)}`}
      </button>

      {/* STICKY BOTTOM - appears once the payment section is in view. */}
      {showStickyBar && (
        <div
          className="fixed inset-x-0 z-30 border-t border-cream-deep bg-white/95 px-4 py-3 backdrop-blur"
          style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-charcoal-mid">Total</p>
              <p className="font-display text-lg font-black tabular-nums text-charcoal">
                {formatPounds(subtotal)}
              </p>
            </div>
            <button
              type="submit"
              disabled={submitting || !stripe || !selectedAddressId || !scheduledFor || outsideDeliveryArea}
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

// Numbered checkout panel. Each callsite passes its explicit step
// number so numbering is deterministic across re-renders (no hidden
// module-level state).
function Section({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <PanelTitle num={num} title={title} size="sm" />
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
