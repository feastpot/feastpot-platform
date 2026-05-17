'use client';

import { Loader2, MapPin, Search, ShieldCheck, X } from 'lucide-react';
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
 * 2026-05-17 wireframe hero — desktop-first split layout with eyebrow
 * tags, big two-tone headline, postcode form, stats card and a
 * decorative gradient hero panel on the right. The coverage flow is
 * unchanged from the previous postcode-first hero: on submit we call
 * `checkCoverage` then either set the cookie and reload (so the home
 * server component re-renders the gated vendor rails) or route to
 * /waitlist for uncovered postcodes.
 *
 * Geolocation fallback ("Use my location") is best-effort — if the
 * browser permission prompt is dismissed or the lookup fails we
 * silently surface the form-validation error so the user can type a
 * postcode manually.
 */
export function PostcodeHero() {
  const router = useRouter();
  const [stored, setStored] = useStoredPostcode();
  const [value, setValue] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [editing, setEditing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stored && !value) setValue(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  const showResumeBanner = Boolean(stored) && !editing;

  const goCovered = (pc: string) => {
    writeCoverageCookie(pc);
    window.location.assign(`/?pc=${encodeURIComponent(pc)}`);
  };

  const runCoverage = async (pc: string) => {
    setSubmitting(true);
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
    await runCoverage(pc);
  };

  const enterEditMode = () => {
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  // Best-effort reverse-geocode: we ask the browser for coordinates and
  // hand them to the public postcodes.io API to find the nearest UK
  // postcode. Anything that fails (denied permission, no signal, API
  // down) falls back to a friendly inline error so the user can type
  // their postcode manually — we never silently grant coverage.
  const onUseLocation = async () => {
    if (locating || submitting) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location lookup isn’t supported on this device.');
      return;
    }
    setError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(
            `https://api.postcodes.io/postcodes?lon=${pos.coords.longitude}&lat=${pos.coords.latitude}&limit=1`,
          );
          const json = await r.json();
          const pc = json?.result?.[0]?.postcode as string | undefined;
          if (!pc) {
            setError('Couldn’t find a postcode for your location — please type it in.');
            setLocating(false);
            return;
          }
          const normalised = normalisePostcode(pc);
          setValue(normalised);
          setStored(normalised);
          setLocating(false);
          await runCoverage(normalised);
        } catch {
          setError('Couldn’t look up your location — please type your postcode.');
          setLocating(false);
        }
      },
      () => {
        setError('Location permission denied — please type your postcode.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  return (
    <section
      aria-labelledby="hero-headline"
      className="bg-cream-warm/40 px-4 pb-12 pt-8 sm:px-6 md:pt-12 lg:px-8 lg:pb-16"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        {/* LEFT — copy + form */}
        <div>
          {/* Eyebrow tag row — three tonal pills surfacing the value props */}
          <div className="flex flex-wrap gap-2">
            <EyebrowTag tone="brand">Location first</EyebrowTag>
            <EyebrowTag tone="plantain">No unavailable vendors shown</EyebrowTag>
            <EyebrowTag tone="scotch">African &amp; Caribbean food</EyebrowTag>
          </div>

          <h1
            id="hero-headline"
            className="mt-6 font-display text-[40px] font-black leading-[1.04] tracking-tight text-charcoal sm:text-[48px] lg:text-[60px]"
          >
            The best of{' '}
            <span className="text-brand">African</span> &amp;{' '}
            <span className="text-scotch">Caribbean</span> food,
            <br className="hidden md:block" /> delivered near you
          </h1>

          <p className="mt-5 max-w-xl text-[15px] font-medium leading-relaxed text-charcoal-mid lg:text-base">
            Party trays, family pots, weekly meals and event catering from
            trusted local cooks. Enter your postcode to see what delivers to
            your area.
          </p>

          {showResumeBanner ? (
            <div
              className="mt-6 flex max-w-md items-center justify-between gap-2 rounded-2xl border border-brand-100 bg-brand-light px-3 py-2"
              role="region"
              aria-label="Resume previous search"
            >
              <span className="min-w-0 truncate text-[13px] text-charcoal">
                <MapPin className="mr-1 -mt-0.5 inline h-3.5 w-3.5 text-brand" aria-hidden />
                Ordering for <strong className="font-bold">{stored}</strong>?
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => stored && runCoverage(stored)}
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
          ) : (
            <form
              onSubmit={onSubmit}
              role="search"
              aria-label="Find vendors by postcode"
              className="mt-7 flex max-w-xl items-center gap-1 rounded-2xl border border-cream-deep bg-white p-1.5 shadow-card"
            >
              <label htmlFor="hero-postcode" className="sr-only">
                UK postcode
              </label>
              <div className="flex flex-1 items-center gap-2 px-3">
                <MapPin className="h-4 w-4 shrink-0 text-charcoal-light" aria-hidden />
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
          )}

          {error && (
            <p role="alert" className="mt-2 max-w-xl text-xs font-medium text-scotch">
              {error}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-charcoal-mid">
            <button
              type="button"
              onClick={onUseLocation}
              disabled={locating || submitting}
              className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline disabled:opacity-60"
            >
              {locating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <MapPin className="h-3.5 w-3.5" aria-hidden />
              )}
              Use my location
            </button>
            <span aria-hidden className="text-charcoal-light">
              ·
            </span>
            <a href="/sign-in" className="font-medium hover:text-charcoal">
              Sign in for saved addresses
            </a>
          </div>

          <p className="mt-5 flex items-center gap-2 text-[12px] font-medium text-charcoal-mid">
            <ShieldCheck className="h-4 w-4 text-brand" aria-hidden />
            Trusted by London communities · Secure checkout · No guessing who
            delivers
          </p>
        </div>

        {/* RIGHT — gradient hero card with cuisine caption */}
        <div className="relative hidden min-h-[360px] lg:block">
          <div
            className="absolute inset-0 overflow-hidden rounded-[40px] shadow-card-lg"
            style={{
              background:
                'radial-gradient(circle at 30% 30%, #F6B400 0%, transparent 45%), radial-gradient(circle at 75% 65%, #E30613 0%, transparent 50%), linear-gradient(135deg, #00843D 0%, #005C2B 100%)',
            }}
            aria-hidden
          />
          <div
            aria-hidden
            className="absolute right-10 top-12 h-40 w-40 rounded-full bg-white/10"
          />
          <div
            aria-hidden
            className="absolute right-24 top-32 h-24 w-24 rounded-full bg-white/15"
          />
          <div
            aria-hidden
            className="absolute bottom-16 left-16 h-32 w-32 rounded-full bg-white/10"
          />
          <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-white/95 px-4 py-3 text-charcoal shadow-card backdrop-blur">
            <p className="text-[13px] font-bold leading-tight">
              Jollof trays · Egusi pots · Jerk chicken · Small chops
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-charcoal-mid">
              Food-led visual placeholder using FeastPot colours
            </p>
          </div>
        </div>
      </div>

      {/* Stats card — sits under the form on desktop, mirrors the wireframe */}
      <div className="mx-auto mt-6 max-w-6xl">
        <div className="grid max-w-md grid-cols-3 gap-3 rounded-2xl border border-cream-deep bg-white p-4 shadow-card sm:gap-6">
          <Stat value="4.8/5" label="community rating" />
          <Stat value="30+" label="occasion types" />
          <Stat value="0" label="vendors shown before postcode" />
        </div>
      </div>
    </section>
  );
}

function EyebrowTag({
  tone,
  children,
}: {
  tone: 'brand' | 'plantain' | 'scotch';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'brand'
      ? 'bg-brand-light text-brand'
      : tone === 'plantain'
        ? 'bg-plantain/15 text-[#8a6a00]'
        : 'bg-scotch/10 text-scotch';
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-bold ${cls}`}
    >
      {children}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-xl font-black leading-none text-charcoal sm:text-2xl">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-medium leading-tight text-charcoal-mid">
        {label}
      </p>
    </div>
  );
}
