'use client';

import { Loader2, MapPin, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { checkCoverage } from '@/lib/api/coverage';
import {
  isValidUKPostcode,
  normalisePostcode,
  useStoredPostcode,
  writeCoverageCookie,
} from '@/lib/postcode';

/**
 * The postcode gate for occasion landing pages. Same coverage flow as
 * the homepage hero form: validate → checkCoverage → covered writes the
 * coverage cookie and goes to /vendors, uncovered goes to /waitlist.
 * No vendor data is fetched or rendered before this gate is passed.
 *
 * When the user arrives via a homepage occasion card the link carries
 * the #occasion-postcode fragment, so the browser lands them on the
 * form; we additionally move focus to the input so keyboard users can
 * type straight away (mirrors the old card → hero-anchor behaviour).
 */
export function OccasionPostcodeForm() {
  const router = useRouter();
  const [stored, setStored] = useStoredPostcode();
  const [value, setValue] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stored && !value) setValue(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  useEffect(() => {
    if (window.location.hash === '#occasion-postcode') {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const pc = normalisePostcode(value);
    if (!pc) {
      setError('Please enter your postcode');
      return;
    }
    if (!isValidUKPostcode(pc)) {
      setError('Please enter a valid UK postcode (e.g. SE15 4ST or SE15)');
      return;
    }
    setError('');
    setStored(pc);
    setSubmitting(true);
    try {
      const result = await checkCoverage(pc);
      if (result.status === 'covered') {
        writeCoverageCookie(pc);
        window.location.assign(`/vendors?postcode=${encodeURIComponent(pc)}`);
      } else if (result.status === 'uncovered') {
        router.push(`/waitlist?postcode=${encodeURIComponent(pc)}`);
      } else {
        setError(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <form
        onSubmit={onSubmit}
        role="search"
        aria-label="Find vendors by postcode"
        className="flex max-w-xl items-center gap-1 rounded-2xl border border-cream-deep bg-white p-1.5 shadow-card"
      >
        <label htmlFor="occasion-postcode" className="sr-only">
          UK postcode
        </label>
        <div className="flex flex-1 items-center gap-2 px-3">
          <MapPin className="h-4 w-4 shrink-0 text-charcoal-light" aria-hidden />
          <input
            ref={inputRef}
            id="occasion-postcode"
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
            disabled={submitting}
            className="flex-1 bg-transparent py-2.5 text-[15px] font-medium text-charcoal placeholder:text-charcoal-light focus:outline-none disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Checking
            </>
          ) : (
            <>
              <Search className="h-4 w-4" aria-hidden />
              Find food near me
            </>
          )}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 max-w-xl text-xs font-medium text-scotch">
          {error}
        </p>
      )}
    </div>
  );
}
