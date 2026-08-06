'use client';

import { Bell, Check, Copy, Crown, MapPin, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { cn } from '@feastpot/ui';

import { useReferrals } from '@/hooks/use-loyalty';
import { useOrder } from '@/hooks/use-orders';
import { useSavingsPotential } from '@/hooks/use-feastpass';
import { shouldShowFeastPassCallout } from '@/lib/feastpass-callout';
import { getPushSupport } from '@/lib/push';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

/**
 * Post-checkout celebration screen. Reached via redirect from
 * /checkout once the PaymentIntent has confirmed AND the API
 * `confirmOrder` call has succeeded - so by the time we mount,
 * the order definitely exists, has a number, and is queued
 * for the vendor.
 *
 * Three calls-to-action:
 *   1. "Track your order" → /orders/{id}/tracking (primary)
 *   2. Push notifications  → only if browser supports + permission not yet granted
 *   3. Referral nudge      → real code from GET /v1/loyalty/referrals via
 *                            useReferrals(); only rendered once the code has
 *                            loaded (guests/loading see no placeholder).
 */
export default function OrderConfirmationPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const { data: order, isLoading, error } = useOrder(orderId);
  const { data: referralData } = useReferrals();
  const { data: savingsPotential } = useSavingsPotential();

  if (isLoading) {
    return (
      <p className="px-4 py-12 text-center text-sm font-medium text-charcoal-mid">
        Loading your order&hellip;
      </p>
    );
  }
  if (error || !order) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-scotch">We couldn&rsquo;t load this order.</p>
        <Link
          href="/account/orders"
          className="mt-3 inline-block text-sm font-bold text-brand hover:underline"
        >
          Go to your order history
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      {/* SUCCESS HERO */}
      <SuccessHero />

      <header className="text-center space-y-1">
        <h1 className="font-display text-2xl font-black text-charcoal">Order placed!</h1>
        <p className="text-sm font-medium text-charcoal-mid">
          Reference <span className="font-mono font-bold text-charcoal">#{order.orderNumber}</span>
        </p>
      </header>

      {/* Vendor + slot card */}
      {order.vendor && (
        <section className="rounded-2xl border border-cream-deep bg-white p-4 space-y-3 shadow-card">
          <div className="flex items-center gap-3">
            {order.vendor.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={order.vendor.logoUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                className="h-12 w-12 shrink-0 rounded-full bg-brand-light text-center font-display text-base font-black leading-[3rem] text-brand"
                aria-hidden
              >
                {order.vendor.businessName.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-charcoal-mid">
                Ordered from
              </p>
              <p className="truncate font-display text-sm font-black text-charcoal">
                {order.vendor.businessName}
              </p>
            </div>
          </div>

          {order.scheduledFor && (
            <div className="flex items-start gap-2 rounded-xl bg-cream px-3 py-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
              <div className="text-xs">
                <p className="font-bold text-charcoal">Estimated delivery</p>
                <p className="font-medium text-charcoal-mid">
                  {new Date(order.scheduledFor).toLocaleString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <p className="mt-0.5 text-charcoal-light">
                  Fulfilled by the vendor on your chosen date.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Items + totals */}
      <section className="rounded-2xl border border-cream-deep bg-white p-4 space-y-3 text-sm">
        <h2 className="font-display font-black text-charcoal">Order summary</h2>
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
        <div className="flex justify-between border-t border-cream-deep pt-3 text-base">
          <span className="font-display font-black text-charcoal">Total paid</span>
          <span className="font-display font-black tabular-nums text-charcoal">
            {formatPounds(order.totalPence)}
          </span>
        </div>
      </section>

      {/* FeastPass upsell — hidden while savings data is loading/errored and
          for active members (server returns savingsPotentialPence=0).
          shouldShowFeastPassCallout() requires a positively-loaded, non-zero
          response so there is no flash during in-flight or error states. */}
      {shouldShowFeastPassCallout(order.serviceFeePence, savingsPotential) && (
        <FeastPassUpsellCallout serviceFeePence={order.serviceFeePence} />
      )}

      {/* Primary CTA */}
      <Link
        href={`/orders/${order.id}/tracking`}
        className="flex h-13 w-full items-center justify-center rounded-2xl bg-brand text-base font-bold text-white shadow-card transition-colors hover:bg-brand-dark"
        style={{ height: 52 }}
      >
        Track your order →
      </Link>

      {/* Push permission nudge */}
      <PushNudge />

      {/* Referral - only render once the API has returned the user's real
          share code (D-104). Hides cleanly for guests and while the request
          is in-flight, instead of rendering a fake `FP-XXXXXX` placeholder. */}
      {referralData?.referralCode ? <ReferralCard code={referralData.referralCode} /> : null}
    </div>
  );
}

/**
 * Post-checkout FeastPass upsell. Shown only when the order had a non-zero
 * service fee and the API signals the customer is not already a member
 * (savingsPotentialPence !== 0). Links to /feastpass with monthly pre-selected.
 */
function FeastPassUpsellCallout({ serviceFeePence }: { serviceFeePence: number }) {
  const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;
  return (
    <section className="rounded-2xl border border-plantain/40 bg-gradient-to-br from-plantain/10 via-white to-brand-light p-4">
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-plantain/20"
          aria-hidden
        >
          <Crown className="h-4 w-4 text-plantain-dark" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-display font-black text-charcoal">
            You paid {formatPounds(serviceFeePence)} in service fees on this order.
          </p>
          <p className="mt-0.5 text-xs font-medium text-charcoal-mid">
            FeastPass members pay £0. For {formatPounds(399)}/month you&rsquo;d keep that money.
          </p>
          <Link
            href="/feastpass?plan=monthly"
            className="mt-2 inline-flex items-center gap-1 rounded-full bg-plantain px-3 py-1.5 text-xs font-bold text-white hover:bg-plantain-dark transition-colors"
          >
            <Crown className="h-3 w-3" aria-hidden />
            Try FeastPass →
          </Link>
        </div>
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

/**
 * Animated tick. Pure CSS using Tailwind's `animate-[bounce-in]` would need a
 * keyframe definition in the global stylesheet - we instead drive the bounce
 * with a tiny inline keyframe + `style={{ animation }}` so this component is
 * self-contained and doesn't bloat globals.css.
 */
function SuccessHero() {
  return (
    <div className="flex justify-center">
      <span
        className="flex h-20 w-20 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/30"
        style={{ animation: 'fp-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      >
        <Check className="h-10 w-10" strokeWidth={3} aria-hidden />
      </span>
      <style jsx>{`
        @keyframes fp-pop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          60% {
            transform: scale(1.15);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function PushNudge() {
  // `getPushSupport()` returns a flat status string (or 'unsupported' /
  // 'no-vapid-key' when the env can't subscribe) - we only show this nudge
  // when the customer has push capability AND hasn't yet decided.
  const [status, setStatus] = useState<ReturnType<typeof getPushSupport> | null>(null);

  useEffect(() => {
    setStatus(getPushSupport());
  }, []);

  // Hide entirely if the browser can't do push, or the customer already
  // granted/denied. The global PushPermissionPrompt also picks up after
  // checkout via `feastpot.has-ordered.v1`, so we don't need to duplicate
  // the actual subscribe flow here - this is a contextual reminder.
  if (status !== 'default') return null;

  return (
    <section className="rounded-2xl border border-brand/30 bg-brand-light p-4">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
        <div className="text-sm">
          <p className="font-display font-black text-charcoal">
            Get notified when your order is ready
          </p>
          <p className="mt-0.5 text-xs font-medium text-charcoal-mid">
            We&rsquo;ll let you know the moment your cook starts preparing and when delivery is on
            its way.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Referral pill. Receives the user's REAL share code from `/v1/referrals`
 * (D-104 fix - previously rendered a fake `FP-XXXXXX` placeholder derived
 * from the email local-part). The parent gates rendering on the code being
 * present, so we can assume `code` is a non-empty redeemable string here.
 */
function ReferralCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked - fail silently */
    }
  };

  return (
    <section className="rounded-2xl bg-gradient-to-br from-brand-light via-white to-plantain/15 border border-plantain/40 p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-plantain" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-display font-black text-charcoal">Love Feastpot? Earn £5 credit</p>
          <p className="mt-0.5 text-xs font-medium text-charcoal-mid">
            Share your code with friends - when they place their first order you both get £5 off.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-full bg-white px-3 py-1.5 text-center text-xs font-mono font-bold tracking-wider text-brand-dark">
              {code}
            </code>
            <button
              type="button"
              onClick={onCopy}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-bold transition-colors',
                copied
                  ? 'bg-brand text-white'
                  : 'border border-cream-deep bg-white text-charcoal hover:border-brand/50',
              )}
              aria-label="Copy referral code"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" aria-hidden /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" aria-hidden /> Copy
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
