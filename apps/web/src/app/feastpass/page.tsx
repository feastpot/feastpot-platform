'use client';

import { Check, ChevronDown, ChevronUp, ShieldCheck, Zap, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

import { useAccessToken } from '@/lib/auth/use-access-token';
import { createFeastPassCheckout } from '@/lib/api/feastpass';

const PERKS = [
  {
    Icon: Wallet,
    title: 'Service fee waived',
    desc: `We charge a ${PLATFORM_FACTS.serviceFee.percent}% service fee (max £${(PLATFORM_FACTS.serviceFee.capPence / 100).toFixed(2)}) on orders you place through Feastpot. Members pay £0 on those orders.`,
  },
  {
    Icon: Zap,
    title: '24-hour priority access',
    desc: 'Vendors mark limited Sunday and event slots as member-priority. You see them a full day before everyone else.',
  },
  {
    Icon: ShieldCheck,
    title: 'Member badge',
    desc: 'Your orders and account carry a FeastPass badge - priority support in our customer service queue.',
  },
];

const FAQS = [
  {
    q: 'Can I cancel any time?',
    a: 'Yes. Go to Account → FeastPass → Manage and cancel in under a minute. No email required, no retention quiz. You keep your benefits until the end of the billing period.',
  },
  {
    q: 'Does FeastPass affect what vendors earn?',
    a: 'No. Vendor payouts are calculated on the order total before platform fees. FeastPass only waives the customer-side service fee on marketplace orders - it is entirely a platform cost.',
  },
  {
    q: 'What counts as the service fee?',
    a: `It is ${PLATFORM_FACTS.serviceFee.percent}% of your order subtotal, capped at £${(PLATFORM_FACTS.serviceFee.capPence / 100).toFixed(2)}. On a £30 order that is £1.50 saved. On orders over £60 you always save the full £${(PLATFORM_FACTS.serviceFee.capPence / 100).toFixed(2)}.`,
  },
  {
    q: 'Does Annual renew automatically?',
    a: 'Yes, annually at £39.90. You can switch to Monthly or cancel before renewal via the customer portal - takes three taps.',
  },
  {
    q: 'What is the priority booking perk exactly?',
    a: 'When a vendor marks a slot as member-priority (limited Sunday tiffins, event caterer slots, and so on) that slot opens to FeastPass members 24 hours before it appears to the general public.',
  },
  {
    q: 'Does FeastPass waive the fee on every order?',
    a: 'It waives the service fee on orders you place through Feastpot - for example when you find a kitchen through postcode search or browse. If you place an order via a kitchen\'s own referral link, the standard service fee still applies. You will always see the applicable fee before you pay.',
  },
];

export default function FeastPassPage() {
  const { token } = useAccessToken();
  const router = useRouter();
  const [plan, setPlan] = useState<'MONTHLY' | 'ANNUAL'>('ANNUAL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live calculator state
  const [ordersPerMonth, setOrdersPerMonth] = useState(3);
  const [avgOrderPence, setAvgOrderPence] = useState(2500);

  // Saving per order = min(subtotal × serviceFee.percent%, serviceFee.capPence)
  const savingPerOrder = Math.min(Math.round(avgOrderPence * PLATFORM_FACTS.serviceFee.percent / 100), PLATFORM_FACTS.serviceFee.capPence);
  const annualSavingPence = savingPerOrder * ordersPerMonth * 12;
  const annualCostPence = plan === 'ANNUAL' ? PLATFORM_FACTS.feastPass.annualPence : PLATFORM_FACTS.feastPass.monthlyPence * 12;
  const netAnnualSavingPence = annualSavingPence - annualCostPence;
  const breakEvenOrders = annualCostPence > 0
    ? Math.ceil(annualCostPence / Math.max(savingPerOrder, 1))
    : 0;

  async function handleSubscribe() {
    if (!token) {
      router.push('/sign-in?redirect=/feastpass');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const origin = window.location.origin;
      const { url } = await createFeastPassCheckout(
        token,
        plan,
        `${origin}/account/feastpass?success=1`,
        `${origin}/feastpass`,
      );
      window.location.href = url;
    } catch (e) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-cream-warm px-4 pb-20">
      {/* Hero */}
      <section className="mx-auto max-w-lg pt-12 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-brand">
          FeastPass
        </span>
        <h1 className="mt-4 font-display text-3xl font-black text-charcoal">
          Great food without <br className="hidden sm:inline" /> the extra charges
        </h1>
        <p className="mt-3 text-base font-medium text-charcoal-mid">
          One membership. No service fee on orders you place through Feastpot. Priority access to the slots everyone wants.
        </p>
        <p className="mt-1.5 text-sm font-bold text-brand">
          Pays for itself from your second order each month.
        </p>
      </section>

      {/* Pricing toggle */}
      <section className="mx-auto mt-8 max-w-sm">
        <div className="flex rounded-2xl border border-cream-deep bg-white p-1 shadow-card">
          {(['MONTHLY', 'ANNUAL'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlan(p)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
                plan === p
                  ? 'bg-brand text-white shadow-card'
                  : 'text-charcoal-mid hover:text-charcoal'
              }`}
            >
              {p === 'MONTHLY' ? 'Monthly - £3.99' : 'Annual - £39.90'}
              {p === 'ANNUAL' && (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-black">
                  2 months free
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-3 text-center">
          <p className="text-3xl font-display font-black text-charcoal">
            {plan === 'MONTHLY' ? '£3.99' : '£3.33'}
            <span className="text-base font-medium text-charcoal-mid"> /month</span>
          </p>
          {plan === 'ANNUAL' && (
            <p className="text-xs font-medium text-charcoal-mid">Billed £39.90/year · cancel any time</p>
          )}
        </div>

        {error && <p className="mt-2 text-center text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={handleSubscribe}
          disabled={loading}
          className="touch-target mt-4 w-full rounded-2xl bg-brand py-4 text-center text-base font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? 'Redirecting…' : token ? 'Start FeastPass' : 'Sign in to subscribe'}
        </button>
        <p className="mt-2 text-center text-xs font-medium text-charcoal-mid">
          Cancel any time · no email required
        </p>
      </section>

      {/* Perks */}
      <section className="mx-auto mt-10 max-w-lg space-y-3">
        {PERKS.map(({ Icon, title, desc }) => (
          <div
            key={title}
            className="flex items-start gap-4 rounded-2xl border border-cream-deep bg-white p-4 shadow-card"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light">
              <Icon className="h-5 w-5 text-brand" aria-hidden />
            </span>
            <div>
              <p className="font-display font-black text-charcoal">{title}</p>
              <p className="mt-0.5 text-sm font-medium leading-snug text-charcoal-mid">{desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Live calculator */}
      <section className="mx-auto mt-10 max-w-lg rounded-2xl border border-cream-deep bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-black text-charcoal">
          How much will you save?
        </h2>
        <p className="mt-0.5 text-sm font-medium text-charcoal-mid">
          Adjust the sliders to match your ordering habits.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-charcoal">
                Orders per month
              </label>
              <span className="text-sm font-black text-brand">{ordersPerMonth}</span>
            </div>
            <input
              type="range"
              min={1}
              max={12}
              value={ordersPerMonth}
              onChange={(e) => setOrdersPerMonth(Number(e.target.value))}
              className="mt-2 w-full accent-brand"
            />
            <div className="flex justify-between text-[11px] text-charcoal-mid">
              <span>1 order</span><span>12 orders</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-charcoal">
                Typical order value
              </label>
              <span className="text-sm font-black text-brand">
                £{(avgOrderPence / 100).toFixed(0)}
              </span>
            </div>
            <input
              type="range"
              min={1000}
              max={8000}
              step={500}
              value={avgOrderPence}
              onChange={(e) => setAvgOrderPence(Number(e.target.value))}
              className="mt-2 w-full accent-brand"
            />
            <div className="flex justify-between text-[11px] text-charcoal-mid">
              <span>£10</span><span>£80</span>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-brand-light p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-charcoal">Service fee saved per order</span>
            <span className="font-black text-charcoal">£{(savingPerOrder / 100).toFixed(2)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm font-medium text-charcoal">Annual saving on fees</span>
            <span className="font-black text-charcoal">£{(annualSavingPence / 100).toFixed(2)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm font-medium text-charcoal">
              FeastPass cost ({plan === 'ANNUAL' ? 'annual' : 'monthly × 12'})
            </span>
            <span className="font-black text-charcoal">−£{(annualCostPence / 100).toFixed(2)}</span>
          </div>
          <div className="mt-2 border-t border-brand/20 pt-2 flex items-center justify-between">
            <span className="font-bold text-charcoal">Net annual saving</span>
            <span
              className={`text-lg font-black ${netAnnualSavingPence >= 0 ? 'text-brand' : 'text-charcoal-mid'}`}
            >
              {netAnnualSavingPence >= 0 ? '+' : ''}
              £{(Math.abs(netAnnualSavingPence) / 100).toFixed(2)}
            </span>
          </div>
          {breakEvenOrders <= ordersPerMonth * 12 && (
            <p className="mt-2 text-xs font-medium text-charcoal-mid">
              You break even after{' '}
              <strong className="text-charcoal">
                {breakEvenOrders} order{breakEvenOrders !== 1 ? 's' : ''}
              </strong>{' '}
              - roughly{' '}
              {Math.ceil(breakEvenOrders / ordersPerMonth)} month{Math.ceil(breakEvenOrders / ordersPerMonth) !== 1 ? 's' : ''} at your current rate.
            </p>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto mt-10 max-w-lg">
        <h2 className="font-display text-lg font-black text-charcoal">Common questions</h2>
        <div className="mt-4 space-y-2">
          {FAQS.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto mt-10 max-w-sm text-center">
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={loading}
          className="touch-target w-full rounded-2xl bg-brand py-4 text-base font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? 'Redirecting…' : 'Start FeastPass today'}
        </button>
        <p className="mt-3 text-xs font-medium text-charcoal-mid">
          <Check className="inline h-3 w-3 text-brand" /> Cancel any time · no email ·{' '}
          <Check className="inline h-3 w-3 text-brand" /> Vendor earnings unaffected
        </p>
      </section>
    </main>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-cream-deep bg-white shadow-card">
      <button
        type="button"
        className="flex w-full items-center justify-between p-4 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="pr-4 font-bold text-charcoal text-sm">{q}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-brand" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-charcoal-mid" />
        )}
      </button>
      {open && (
        <p className="px-4 pb-4 text-sm font-medium leading-relaxed text-charcoal-mid">{a}</p>
      )}
    </div>
  );
}
