'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@feastpot/ui';

const CITIES = [
  'Croydon',
  'London',
  'Birmingham',
  'Manchester',
  'Leeds',
  'Bristol',
  'Nottingham',
  'Leicester',
  'Luton',
  'Reading',
] as const;

const SWAP_INTERVAL_MS = 2200;
const FADE_OUT_MS = 280;

/**
 * Two-line hero headline + use-case subline:
 *
 *   Your community's best cooks.
 *   Delivering to <Croydon>.        ← city fades + slides up every 2.2s
 *   Party trays • Family portions • Weekly meals • Event catering
 *
 * City rotation order starts with Croydon (largest African & Caribbean
 * population outside inner London), then descends through the next nine
 * UK metros with strongest diaspora density.
 *
 * The swap timeout is tracked in a ref so we can cancel it on unmount -
 * otherwise React warns "Can't perform a state update on an unmounted
 * component" if the timeout fires within 280ms of navigation away.
 *
 * Fixed-height row on the second line prevents the subline from jumping
 * up when a longer city name (e.g. "Birmingham") replaces a shorter
 * one ("Leeds"). The city span carries `aria-live="polite"` so screen
 * readers announce each rotation without interrupting the user.
 *
 * Font sizes use a clamp() so the headline never wraps at 375px (iPhone
 * SE) yet scales up cleanly on tablet/desktop without a media query.
 */
export function AnimatedHeadline() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const swapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      swapTimeoutRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % CITIES.length);
        setVisible(true);
      }, FADE_OUT_MS);
    }, SWAP_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (swapTimeoutRef.current) clearTimeout(swapTimeoutRef.current);
    };
  }, []);

  return (
    <div className="text-center text-white">
      {/* Line 1 - static */}
      <h1
        className="font-black leading-tight tracking-tight"
        style={{ fontSize: 'clamp(22px, 5.8vw, 34px)' }}
      >
        Your community&rsquo;s best cooks.
      </h1>

      {/* Line 2 - "Delivering to" + animated city */}
      <h2
        className="mt-1 font-black leading-tight tracking-tight"
        style={{ fontSize: 'clamp(22px, 5.8vw, 34px)' }}
      >
        Delivering to{' '}
        <span
          aria-live="polite"
          className={cn(
            'inline-block transition-all',
            visible
              ? 'translate-y-0 opacity-100'
              : '-translate-y-[6px] opacity-0',
          )}
          style={{ transitionDuration: `${FADE_OUT_MS}ms` }}
        >
          {CITIES[idx]}.
        </span>
      </h2>

      {/* Subline - four use cases */}
      <p className="mt-3 text-[13px] text-white/85">
        Party trays • Family portions • Weekly meals • Event catering
      </p>
    </div>
  );
}
