'use client';

import { ArrowRight, MapPin, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { AnimatedHeadline } from '@/components/home/animated-headline';
import { normalisePostcode, useStoredPostcode } from '@/lib/postcode';

const TRUST_STRIP = [
  { icon: '🛡️', label: 'FSA Verified', sub: 'All kitchens checked' },
  { icon: '⭐', label: '4.8 Rating', sub: '500+ community reviews' },
  { icon: '🍽️', label: '50+ Vendors', sub: 'New cooks weekly' },
  { icon: '🔒', label: 'Secure Pay', sub: 'Stripe encrypted' },
] as const;

/**
 * Brand-DNA hero: layered charcoal→scotch→terracotta gradient with a faint
 * tribal-weave overlay and four floating ingredient glyphs (chilli, plantain,
 * stew-pot, jar) lifted from the Feastpot logo. The depth + warmth push the
 * page away from "generic tech app" minimalism and signal "African / Caribbean
 * home cooking" before the user reads a single word.
 *
 * The postcode form is unchanged — it's the section's primary conversion goal,
 * so we preserve the exact validation + storage path. The trust strip + kente
 * divider sit inside the same root fragment so the hero ships as one self-
 * contained unit (page.tsx doesn't need to compose them itself).
 *
 * Validation reuses `normalisePostcode` (deliberately permissive — see prior
 * comment about BFPO / GIR 0AA edge cases). `<form>` not `<div>` so iOS Safari
 * surfaces the "Go" key on the postcode keyboard.
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
    // Move focus into the postcode input so keyboard / screen-reader
    // users can immediately type a new value without hunting for the
    // next interactive element.
    inputRef.current?.focus();
  };

  return (
    <>
      <section
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #1C1C1A 0%, #3D1A0A 45%, #E8520A 100%)',
          minHeight: '360px',
        }}
      >
        {/* Faint kente weave — already defined in globals.css as .tribal-bg.
            Forced opacity 0.07 keeps it well below WCAG contrast minimums so
            it never interferes with overlaid white text. */}
        <div className="absolute inset-0 tribal-bg" style={{ opacity: 0.07 }} aria-hidden />

        {/* Floating ingredient glyphs — purely decorative; pointer-events:none
            so they never intercept taps on the postcode form. Positioned
            asymmetrically (top-right cluster, plus a single top-left jar) to
            mimic spilled spices on a dark wood table. */}
        <div
          className="pointer-events-none absolute top-8 right-6 select-none"
          aria-hidden
          style={{ opacity: 0.18, transform: 'rotate(15deg)', fontSize: '36px' }}
        >
          🌶️
        </div>
        <div
          className="pointer-events-none absolute top-20 right-20 select-none"
          aria-hidden
          style={{ opacity: 0.13, transform: 'rotate(-8deg)', fontSize: '28px' }}
        >
          🍌
        </div>
        <div
          className="pointer-events-none absolute bottom-14 right-10 select-none"
          aria-hidden
          style={{ opacity: 0.16, transform: 'rotate(5deg)', fontSize: '30px' }}
        >
          🥘
        </div>
        <div
          className="pointer-events-none absolute top-12 left-6 select-none"
          aria-hidden
          style={{ opacity: 0.12, transform: 'rotate(-12deg)', fontSize: '26px' }}
        >
          🫙
        </div>

        <div className="relative z-10 px-5 pt-14 pb-8">
          <AnimatedHeadline />

          <p className="mt-3 text-center text-sm text-white/85">
            Nigerian · Ghanaian · Jamaican · Caribbean
          </p>

          {/* Resume banner — when we have a stored postcode from a
              previous session, surface it as a one-tap shortcut so
              returning users don't have to re-type. The 45yo target
              demographic is the #1 churn risk if we make them re-enter
              their location every visit. The banner is rendered ABOVE
              the form (not in place of it) so changing postcodes
              remains a single visible action. Pure white-on-translucent
              chrome to sit cleanly on the dark gradient. */}
          {stored && (
            <div
              className="mx-auto mt-4 flex max-w-sm items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 backdrop-blur"
              role="region"
              aria-label="Resume previous search"
            >
              <span className="min-w-0 truncate text-[13px] text-white">
                <MapPin className="mr-1 -mt-0.5 inline h-3.5 w-3.5" aria-hidden />
                Ordering for <strong className="font-semibold">{stored}</strong>?
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={resumeWithStored}
                  className="touch-target rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark"
                >
                  Find food
                </button>
                <button
                  type="button"
                  onClick={clearStored}
                  aria-label="Clear saved postcode"
                  className="touch-target inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/25"
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
            className="mx-auto mt-6 flex max-w-sm items-center gap-2 rounded-2xl bg-white p-1.5 shadow-card-lg"
          >
            <label htmlFor="hero-postcode" className="sr-only">
              UK postcode
            </label>
            <div className="flex flex-1 items-center gap-2 px-3">
              <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden />
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
        </div>
      </section>

      {/* TRUST STRIP — full-width charcoal band immediately under the hero.
          Sits OUTSIDE the gradient section so the four pillars feel like a
          distinct foundation row, not a footer of the hero. */}
      <div style={{ background: '#1C1C1A', padding: '12px 16px' }}>
        <ul className="mx-auto flex max-w-lg items-center justify-around">
          {TRUST_STRIP.map((t) => (
            <li key={t.label} className="flex flex-col items-center text-center">
              <span aria-hidden style={{ fontSize: '18px', marginBottom: '2px' }}>
                {t.icon}
              </span>
              <span style={{ color: 'white', fontSize: '10px', fontWeight: 700 }}>
                {t.label}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '9px' }}>
                {t.sub}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Kente diamond divider closes out the hero "stack" before the page
          transitions into the lighter cream sections below. */}
      <div className="kente-divider" aria-hidden />
    </>
  );
}
