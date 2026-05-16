'use client';

import { Loader2, MapPin, Search, X } from 'lucide-react';
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
 * 2026-05-17 postcode-first hero.
 *
 * Now performs an inline coverage check on submit:
 *   - Covered  → set `feastpot.coverage.v1` cookie + reload home so the
 *               server component renders the vendor rails.
 *   - Uncovered → route to `/waitlist?postcode=…` (no cookie set).
 *
 * Coverage failure (network blip) is treated as "covered" inside
 * `checkCoverage` to avoid stranding users — they fall through to the
 * vendors page which has its own empty state.
 */
export function PostcodeHero() {
  const router = useRouter();
  const [stored, setStored] = useStoredPostcode();
  const [value, setValue] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [editing, setEditing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stored && !value) setValue(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  const showResumeBanner = Boolean(stored) && !editing;
  const showForm = !showResumeBanner;

  const goCovered = (pc: string) => {
    writeCoverageCookie(pc);
    // Hard reload so the homepage server component re-renders with the
    // newly-set cookie and the gated vendor rails appear.
    window.location.assign(`/?pc=${encodeURIComponent(pc)}`);
  };

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
    setSubmitting(true);
    setStored(pc);
    try {
      const result = await checkCoverage(pc);
      if (result.status === 'covered') {
        goCovered(pc);
      } else if (result.status === 'uncovered') {
        router.push(`/waitlist?postcode=${encodeURIComponent(pc)}`);
      } else {
        setError(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resumeWithStored = async () => {
    if (!stored || submitting) return;
    setSubmitting(true);
    try {
      const result = await checkCoverage(stored);
      if (result.status === 'covered') {
        goCovered(stored);
      } else if (result.status === 'uncovered') {
        router.push(`/waitlist?postcode=${encodeURIComponent(stored)}`);
      } else {
        setError(result.message);
        enterEditMode();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const enterEditMode = () => {
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  return (
    <section
      aria-labelledby="hero-headline"
      className="relative overflow-hidden bg-cream px-4 pb-8 pt-8 md:px-8 md:pb-14 md:pt-14"
    >
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-10">
        <div>
          <h1
            id="hero-headline"
            className="font-display text-[40px] font-black leading-[1.02] tracking-tight text-charcoal md:text-[56px]"
          >
            The best of{' '}
            <span className="text-brand">African</span> &amp;{' '}
            <span className="text-scotch">Caribbean</span> food, delivered to you
          </h1>
          <p className="mt-4 max-w-xl text-base font-medium text-charcoal-mid md:text-lg">
            Bold flavours. Real culture. Right to your door.
          </p>

          {showResumeBanner && (
            <div
              className="mt-5 flex max-w-md items-center justify-between gap-2 rounded-2xl border border-brand-100 bg-brand-light px-3 py-2"
              role="region"
              aria-label="Resume previous search"
            >
              <span className="min-w-0 truncate text-[13px] text-charcoal">
                <MapPin className="mr-1 -mt-0.5 inline h-3.5 w-3.5 text-brand" aria-hidden />
                Ordering for <strong className="font-semibold">{stored}</strong>?
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={resumeWithStored}
                  disabled={submitting}
                  className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                  Find food
                </button>
                <button
                  type="button"
                  onClick={enterEditMode}
                  aria-label="Change saved postcode"
                  className="touch-target inline-flex items-center gap-1 rounded-xl bg-white px-2 py-1.5 text-[12px] font-medium text-charcoal-mid transition-colors hover:bg-cream-warm"
                >
                  <X className="h-3 w-3" aria-hidden />
                  Change
                </button>
              </div>
            </div>
          )}

          {showForm && (
            <form
              onSubmit={onSubmit}
              role="search"
              aria-label="Find vendors by postcode"
              className="mt-7 flex max-w-md items-center gap-1 rounded-2xl border border-cream-deep bg-white p-1.5 shadow-card"
            >
              <label htmlFor="hero-postcode" className="sr-only">
                UK postcode
              </label>
              <div className="flex flex-1 items-center gap-2 px-3">
                <Search className="h-4 w-4 shrink-0 text-charcoal-light" aria-hidden />
                <input
                  ref={inputRef}
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
                  disabled={submitting}
                  className="flex-1 bg-transparent py-2 text-[15px] font-medium text-charcoal placeholder:text-charcoal-light focus:outline-none disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Checking
                  </>
                ) : (
                  'Find Food'
                )}
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="mt-2 max-w-md text-xs font-medium text-scotch">
              {error}
            </p>
          )}
        </div>

        <div className="relative hidden min-h-[300px] md:block">
          <div
            className="absolute inset-0 overflow-hidden rounded-[40px] shadow-card-lg"
            style={{
              background:
                'radial-gradient(circle at 30% 30%, #F6B400 0%, transparent 45%), radial-gradient(circle at 75% 65%, #E30613 0%, transparent 50%), linear-gradient(135deg, #00843D 0%, #005C2B 100%)',
            }}
            aria-hidden
          />
          <div
            className="absolute -left-4 top-12 h-72 w-16 rounded-l-full border-l-[18px] border-brand"
            aria-hidden
          />
          <div
            className="absolute bottom-8 left-12 h-32 w-48 rounded-b-full border-b-[16px] border-plantain"
            aria-hidden
          />
          <div
            className="absolute bottom-6 right-6 rounded-2xl bg-white/95 px-4 py-2 text-xs font-bold text-charcoal shadow-card backdrop-blur"
            aria-hidden
          >
            Jollof · Jerk · Egusi · Small chops
          </div>
        </div>
      </div>
    </section>
  );
}
