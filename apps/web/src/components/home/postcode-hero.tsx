'use client';

import { ArrowRight, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { AnimatedHeadline } from '@/components/home/animated-headline';
import { normalisePostcode, useStoredPostcode } from '@/lib/postcode';

const TRUST_SIGNALS = [
  { icon: '🍽️', text: '50+ vendors' },
  { icon: '⭐', text: '4.8 avg rating' },
  { icon: '🔒', text: 'FSA verified' },
] as const;

/**
 * Brand-gradient hero with cycling-cuisine headline + postcode capture.
 *
 * Validation reuses the project's `normalisePostcode` (returns the cleaned
 * value or empty string). We do NOT block submit on a strict UK regex — the
 * /vendors page is the source of truth for postcode geocoding, and a too-strict
 * client check rejects valid edge cases (e.g. BFPO, Channel Islands, GIR 0AA).
 * Persisting via `useStoredPostcode` keeps the value across visits and SSR
 * without us touching localStorage from the component directly.
 *
 * `<form>` not `<div>` so iOS Safari shows a "Go" key on the postcode input
 * keyboard and the user can submit by pressing it.
 */
export function PostcodeHero() {
  const router = useRouter();
  const [stored, setStored] = useStoredPostcode();
  const [value, setValue] = useState<string>('');
  const [error, setError] = useState<string>('');

  // `useStoredPostcode` reads localStorage in an effect (SSR-safe), so `stored`
  // arrives null on the first render and populates after mount. Sync once into
  // local state so the saved postcode pre-fills, but don't overwrite anything
  // the user has already typed.
  useEffect(() => {
    if (stored && !value) setValue(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const pc = normalisePostcode(value);
    if (!pc) {
      setError('Please enter your postcode');
      return;
    }
    setError('');
    setStored(pc);
    router.push(`/vendors?postcode=${encodeURIComponent(pc)}`);
  };

  return (
    <section className="brand-gradient px-5 pb-10 pt-6">
      <AnimatedHeadline />

      <p className="mt-3 text-center text-sm text-white/85">
        Nigerian · Ghanaian · Jamaican · Caribbean
      </p>

      <form
        onSubmit={onSubmit}
        role="search"
        aria-label="Find vendors by postcode"
        className="mx-auto mt-6 flex max-w-sm items-center gap-2 rounded-2xl bg-white p-1.5 shadow-card-lg"
      >
        <label htmlFor="hero-postcode" className="sr-only">
          UK postcode
        </label>
        <div className="flex flex-1 items-center gap-2 px-3">
          <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <input
            id="hero-postcode"
            type="text"
            inputMode="text"
            autoComplete="postal-code"
            placeholder="Enter your postcode"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError('');
            }}
            maxLength={8}
            className="flex-1 bg-transparent text-[15px] font-medium text-dark placeholder:text-mid focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
        >
          Find food
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-white/95">
          {error}
        </p>
      )}

      <ul className="mt-5 flex items-center justify-center gap-6">
        {TRUST_SIGNALS.map(({ icon, text }) => (
          <li key={text} className="flex items-center gap-1.5 text-xs text-white/85">
            <span aria-hidden>{icon}</span>
            <span className="font-medium">{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
