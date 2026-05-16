'use client';

import { MapPin, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { isValidUKPostcode, normalisePostcode, useStoredPostcode } from '@/lib/postcode';

/**
 * 2026-05-16 wireframe redesign hero.
 *
 * Replaces the previous dark-gradient hero with the wireframe's light-cream
 * editorial layout: two-column (text + food collage on desktop, stacked on
 * mobile) with a coloured headline ("African" green, "Caribbean" red) and a
 * white postcode capture pill. The hero is the only place a first-time
 * visitor decides whether to engage, so the form stays the primary
 * affordance — validation + storage path is unchanged from the previous
 * version (normalisePostcode + isValidUKPostcode).
 *
 * No external food photography is shipped in Wave 1 — the right column
 * renders as a layered brand-colour collage so we don't fake a stock shot.
 * Real photography drops in a follow-up content wave.
 */
export function PostcodeHero() {
  const router = useRouter();
  const [stored, setStored] = useStoredPostcode();
  const [value, setValue] = useState<string>('');
  const [error, setError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!isValidUKPostcode(pc)) {
      setError('Please enter a valid UK postcode (e.g. SE15 4ST or SE15)');
      return;
    }
    setError('');
    setStored(pc);
    router.push(`/vendors?postcode=${encodeURIComponent(pc)}`);
  };

  const resumeWithStored = () => {
    if (!stored) return;
    router.push(`/vendors?postcode=${encodeURIComponent(stored)}`);
  };

  const clearStored = () => {
    setStored(null);
    setValue('');
    inputRef.current?.focus();
  };

  return (
    <section
      aria-labelledby="hero-headline"
      className="relative overflow-hidden bg-cream px-4 pb-8 pt-8 md:px-8 md:pb-14 md:pt-14"
    >
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-10">
        {/* LEFT — copy + postcode form */}
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

          {/* Resume banner — returning user gets a one-tap shortcut. */}
          {stored && (
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
                  className="touch-target rounded-xl bg-brand px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark"
                >
                  Find food
                </button>
                <button
                  type="button"
                  onClick={clearStored}
                  aria-label="Clear saved postcode"
                  className="touch-target inline-flex items-center gap-1 rounded-xl bg-white px-2 py-1.5 text-[12px] font-medium text-charcoal-mid transition-colors hover:bg-cream-warm"
                >
                  <X className="h-3 w-3" aria-hidden />
                  Change
                </button>
              </div>
            </div>
          )}

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
                className="flex-1 bg-transparent py-2 text-[15px] font-medium text-charcoal placeholder:text-charcoal-light focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
            >
              Find Food
            </button>
          </form>

          {error && (
            <p role="alert" className="mt-2 max-w-md text-xs font-medium text-scotch">
              {error}
            </p>
          )}
        </div>

        {/* RIGHT — brand-colour food collage placeholder. Pure CSS so we
            don't ship a stock photo we don't have rights to. The three
            green / gold / red bands echo the wireframe's plated trio
            without faking specific dishes. Hidden on the smallest
            screens so the form gets the full attention. */}
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
