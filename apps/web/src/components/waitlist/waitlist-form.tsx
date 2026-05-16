'use client';

import { CheckCircle2, Loader2, MapPin, Truck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { registerCoverageInterest } from '@/lib/api/coverage';
import {
  isValidUKPostcode,
  normalisePostcode,
  readStoredPostcode,
} from '@/lib/postcode';

/**
 * Uncovered-postcode waitlist capture. Renders inside a Suspense boundary
 * because it reads the postcode from the search params.
 */
export function WaitlistForm() {
  const params = useSearchParams();
  const urlPostcode = params?.get('postcode')?.trim().toUpperCase() ?? '';

  const [postcode, setPostcode] = useState<string>(urlPostcode);
  const [email, setEmail] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [marketingConsent, setMarketingConsent] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Fall back to the stored postcode if the user reached /waitlist directly
  // (e.g. typed the URL, came from a "share with a friend" link). The form
  // still re-validates the value below.
  useEffect(() => {
    if (!postcode) {
      const stored = readStoredPostcode();
      if (stored) setPostcode(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const pc = normalisePostcode(postcode);
    if (!isValidUKPostcode(pc)) {
      setError('Please enter a valid UK postcode (e.g. SE15 4ST or SE15)');
      return;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await registerCoverageInterest({
        email: email.trim(),
        postcode: pc,
        name: name.trim() || undefined,
        marketingConsent,
      });
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't save your details just now. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
      {/* HERO */}
      <header className="rounded-3xl border border-cream-deep bg-cream-warm p-6 text-center md:p-10">
        <span
          aria-hidden
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-light text-brand"
        >
          <MapPin className="h-7 w-7" />
        </span>
        <p className="mt-4 text-[11px] font-black uppercase tracking-[0.18em] text-brand">
          Coverage update
        </p>
        <h1 className="mt-2 font-display text-3xl font-black leading-[1.1] tracking-tight text-charcoal md:text-4xl">
          We don&rsquo;t deliver to{' '}
          <span className="text-brand">{postcode || 'your postcode'}</span> yet
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-relaxed text-charcoal-mid md:text-base">
          We&rsquo;re onboarding new kitchens across the UK every week. Leave
          your details and we&rsquo;ll email you the moment a cook goes live in
          your area.
        </p>
      </header>

      {/* FORM or SUCCESS */}
      {submitted ? (
        <section
          aria-labelledby="thanks-heading"
          className="mt-6 rounded-3xl border border-brand bg-brand-light p-6 text-center md:p-10"
        >
          <CheckCircle2
            className="mx-auto h-12 w-12 text-brand"
            aria-hidden
          />
          <h2
            id="thanks-heading"
            className="mt-3 font-display text-2xl font-black text-charcoal"
          >
            You&rsquo;re on the list
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm font-medium text-charcoal-mid">
            We&rsquo;ll email{' '}
            <strong className="font-semibold text-charcoal">{email}</strong> as
            soon as a kitchen near{' '}
            <strong className="font-semibold text-charcoal">{postcode}</strong>{' '}
            is taking orders.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center rounded-2xl bg-charcoal px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-charcoal-mid"
          >
            Back to home
          </Link>
        </section>
      ) : (
        <section className="mt-6 rounded-3xl border border-cream-deep bg-white p-6 shadow-card md:p-8">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="waitlist-postcode"
                className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.14em] text-charcoal-mid"
              >
                Postcode
              </label>
              <input
                id="waitlist-postcode"
                type="text"
                inputMode="text"
                autoComplete="postal-code"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                maxLength={8}
                required
                className="w-full rounded-2xl border border-cream-deep bg-cream-warm px-4 py-3 text-[15px] font-medium text-charcoal placeholder:text-charcoal-light focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="waitlist-email"
                className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.14em] text-charcoal-mid"
              >
                Email address
              </label>
              <input
                id="waitlist-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-cream-deep bg-cream-warm px-4 py-3 text-[15px] font-medium text-charcoal placeholder:text-charcoal-light focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="waitlist-name"
                className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.14em] text-charcoal-mid"
              >
                Name <span className="font-medium normal-case text-charcoal-light">(optional)</span>
              </label>
              <input
                id="waitlist-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="What should we call you?"
                className="w-full rounded-2xl border border-cream-deep bg-cream-warm px-4 py-3 text-[15px] font-medium text-charcoal placeholder:text-charcoal-light focus:border-brand focus:outline-none"
              />
            </div>

            <label className="flex items-start gap-2.5 rounded-2xl bg-cream-warm p-3 text-xs font-medium text-charcoal-mid">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
              <span>
                Send me the occasional Feastpot update — new vendors, launches in
                my area and recipe tips. Unsubscribe any time.
              </span>
            </label>

            {error && (
              <p role="alert" className="text-sm font-medium text-scotch">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60 md:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Adding you to the list
                </>
              ) : (
                <>
                  <Truck className="h-4 w-4" aria-hidden />
                  Notify me when you launch here
                </>
              )}
            </button>
          </form>
        </section>
      )}

      <div className="mt-6 text-center">
        <Link
          href="/"
          className="text-sm font-bold text-charcoal-mid underline hover:text-charcoal"
        >
          Try a different postcode
        </Link>
      </div>
    </article>
  );
}
