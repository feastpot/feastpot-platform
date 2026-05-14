'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@feastpot/ui';

const CITIES = [
  'London',
  'Birmingham',
  'Manchester',
  'Leeds',
  'Bristol',
  'Nottingham',
  'Leicester',
  'Croydon',
  'Luton',
  'Reading',
] as const;

const SWAP_INTERVAL_MS = 2200;
const FADE_OUT_MS = 300;

/**
 * Three-line headline whose final line cycles through UK cities/major
 * towns where the African & Caribbean diaspora has critical mass:
 *
 *   Authentic African & Caribbean
 *   Meals and Trays Delivered in
 *   <London>           ← fades out, swaps, fades in every 2.2s
 *
 * The inner setTimeout is tracked in a ref so we can cancel it on unmount —
 * otherwise React warns "Can't perform a state update on an unmounted
 * component" if the interval fires within 300ms of navigation away.
 *
 * Fixed-height row prevents the surrounding layout from jumping when a
 * longer city name (e.g. "Birmingham") replaces a shorter one ("Leeds").
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
      <h1 className="text-[26px] font-black leading-tight tracking-tight sm:text-[28px]">
        Authentic African &amp; Caribbean
      </h1>
      <h1 className="text-[26px] font-black leading-tight tracking-tight sm:text-[28px]">
        Meals and Trays Delivered in
      </h1>
      <div className="flex h-10 items-center justify-center overflow-hidden" aria-live="polite">
        <span
          className={cn(
            'text-[28px] font-black tracking-tight transition-all duration-300',
            visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
          )}
        >
          {CITIES[idx]}
        </span>
      </div>
    </div>
  );
}
