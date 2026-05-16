'use client';

import { Button } from '@feastpot/ui';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { PageShell } from '@/components/layout/page-shell';
import { useConfirmDeposit, useEventEnquiry, useSelectVendor } from '@/hooks/use-event-enquiries';
import type { EventQuote } from '@/lib/api/event-enquiries';
import { STRIPE_CONFIGURED, getStripe } from '@/lib/stripe';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

export default function EventEnquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const stripePromise = useMemo(() => getStripe(), []);
  const { data: enquiry, isLoading, error } = useEventEnquiry(id);

  if (isLoading) return <PageShell><p className="py-8 text-center text-sm font-medium text-charcoal-mid">Loading…</p></PageShell>;
  if (error || !enquiry) return <PageShell><p className="py-8 text-center text-sm font-medium text-scotch">Enquiry not found.</p></PageShell>;

  return (
    <PageShell>
      <Link href="/events" className="text-xs font-bold text-charcoal-mid hover:text-brand-dark hover:underline">← Back to events</Link>
      <header className="py-4">
        <h1 className="font-display text-2xl font-black capitalize tracking-tight text-charcoal">{enquiry.eventType}</h1>
        <dl className="mt-2 grid grid-cols-2 gap-1 text-sm font-medium text-charcoal-mid">
          <div><dt className="inline">Date: </dt><dd className="inline text-charcoal">{new Date(enquiry.eventDate).toLocaleString('en-GB')}</dd></div>
          <div><dt className="inline">Guests: </dt><dd className="inline text-charcoal">{enquiry.guestCount}</dd></div>
          <div><dt className="inline">Postcode: </dt><dd className="inline text-charcoal">{enquiry.postcode}</dd></div>
          <div><dt className="inline">Cuisines: </dt><dd className="inline text-charcoal">{enquiry.cuisines.join(', ') || '—'}</dd></div>
        </dl>
        <p className="mt-3 text-xs font-medium text-charcoal-mid">
          Matched vendors: <strong className="font-bold text-charcoal">{enquiry.matchedVendorIds.length}</strong> · Quotes received: <strong className="font-bold text-charcoal">{enquiry.quotes?.length ?? 0}</strong>
        </p>
      </header>

      {enquiry.status === 'confirmed' && (
        <div className="rounded-xl border border-brand/30 bg-brand/10 p-3 text-sm font-medium text-brand-dark">
          Booking confirmed with {enquiry.selectedVendor?.businessName ?? 'your chosen vendor'}.{' '}
          <Link href={`/events/${enquiry.id}/confirmed`} className="font-bold underline">View booking →</Link>
        </div>
      )}

      <section className="mt-4 space-y-3">
        <h2 className="font-display text-base font-black tracking-tight text-charcoal">Quotes received</h2>
        {(!enquiry.quotes || enquiry.quotes.length === 0) && (
          <p className="rounded-xl border border-dashed border-cream-deep bg-cream/50 p-4 text-sm font-medium text-charcoal-mid">
            No quotes yet — vendors typically respond within 24 hours.
          </p>
        )}
        {enquiry.quotes?.filter((q) => q.status === 'submitted' || q.status === 'accepted').map((q) => (
          <Elements key={q.id} stripe={stripePromise}>
            <QuoteCard quote={q} enquiryId={enquiry.id} guestCount={enquiry.guestCount} canSelect={enquiry.status !== 'confirmed' && STRIPE_CONFIGURED} />
          </Elements>
        ))}
      </section>
    </PageShell>
  );
}

function QuoteCard({
  quote,
  enquiryId,
  guestCount,
  canSelect,
}: { quote: EventQuote; enquiryId: string; guestCount: number; canSelect: boolean }) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const select = useSelectVendor(enquiryId);
  const confirmDeposit = useConfirmDeposit(enquiryId);
  const [stage, setStage] = useState<'view' | 'pay'>('view');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [depositPence, setDepositPence] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const subtotal = quote.perHeadPence * guestCount;
  const total = subtotal + quote.deliveryFeePence;
  const deposit = Math.max(50, Math.round((total * (quote.minDepositPct || 30)) / 100));

  async function onChoose() {
    setErr(null);
    try {
      const res = await select.mutateAsync(quote.vendorId);
      setClientSecret(res.clientSecret);
      setDepositPence(res.depositPence);
      setStage('pay');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function onPay() {
    if (!stripe || !elements || !clientSecret) return;
    setSubmitting(true);
    setErr(null);
    const card = elements.getElement(CardElement);
    if (!card) { setErr('Card details required'); setSubmitting(false); return; }
    const { error: stripeErr, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card },
    });
    if (stripeErr) {
      setErr(stripeErr.message ?? 'Payment failed');
      setSubmitting(false);
      return;
    }
    if (paymentIntent && (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded')) {
      // Server-side verifies the PI status before flipping booking to confirmed.
      try {
        await confirmDeposit.mutateAsync();
      } catch (e) {
        setErr(`Payment succeeded but booking confirmation failed: ${(e as Error).message}`);
        setSubmitting(false);
        return;
      }
      router.push(`/events/${enquiryId}/confirmed`);
      return;
    }
    setErr(`Unexpected status: ${paymentIntent?.status ?? 'unknown'}`);
    setSubmitting(false);
  }

  return (
    <article className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm">
      <header className="flex items-baseline justify-between">
        <h3 className="font-display text-base font-black text-charcoal">{quote.vendor?.businessName ?? 'Vendor'}</h3>
        <span className="text-xs font-bold text-charcoal-mid"><span className="text-plantain">★</span> {quote.vendor?.rating?.toFixed(1) ?? '—'}</span>
      </header>
      {quote.proposedMenu && (
        <p className="mt-2 whitespace-pre-line text-sm font-medium text-charcoal">{quote.proposedMenu}</p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-1 text-sm font-medium text-charcoal">
        <div><dt className="inline text-charcoal-mid">Per head: </dt><dd className="inline">{formatPounds(quote.perHeadPence)} × {guestCount}</dd></div>
        <div><dt className="inline text-charcoal-mid">Subtotal: </dt><dd className="inline">{formatPounds(subtotal)}</dd></div>
        <div><dt className="inline text-charcoal-mid">Delivery: </dt><dd className="inline">{formatPounds(quote.deliveryFeePence)}</dd></div>
        <div><dt className="inline text-charcoal-mid">Total: </dt><dd className="inline font-bold">{formatPounds(total)}</dd></div>
        <div className="col-span-2"><dt className="inline text-charcoal-mid">Deposit ({quote.minDepositPct}%): </dt><dd className="inline font-bold">{formatPounds(deposit)}</dd></div>
      </dl>
      {quote.terms && <p className="mt-2 whitespace-pre-line text-xs font-medium text-charcoal-mid">Terms: {quote.terms}</p>}

      {stage === 'view' && canSelect && quote.status === 'submitted' && (
        <Button className="mt-3 w-full rounded-xl bg-brand py-3 font-bold text-white hover:bg-brand-dark" onClick={onChoose} disabled={select.isPending}>
          {select.isPending ? 'Selecting…' : 'Select this vendor'}
        </Button>
      )}
      {quote.status === 'accepted' && (
        <p className="mt-3 rounded-full bg-brand/10 px-3 py-1 text-center text-xs font-bold text-brand-dark">✓ Selected</p>
      )}

      {stage === 'pay' && (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-medium text-charcoal">Pay deposit of <strong className="font-bold">{formatPounds(depositPence)}</strong> to confirm.</p>
          <div className="rounded-xl border border-cream-deep bg-white p-3">
            <CardElement options={{ style: { base: { fontSize: '16px' } } }} />
          </div>
          <Button onClick={onPay} disabled={submitting} className="w-full rounded-xl bg-brand py-3 font-bold text-white hover:bg-brand-dark">
            {submitting ? 'Processing…' : `Pay ${formatPounds(depositPence)}`}
          </Button>
        </div>
      )}

      {err && <p className="mt-2 text-sm font-medium text-scotch">{err}</p>}
    </article>
  );
}
