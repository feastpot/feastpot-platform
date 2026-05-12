'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@feastpot/ui';

const CUISINES = [
  'Jollof Rice',
  'Egusi Soup',
  'Pepper Soup',
  'Oxtail',
  'Party Trays',
  'Jerk Chicken',
  'Pounded Yam',
  'Small Chops',
] as const;

const SWAP_INTERVAL_MS = 2200;
const FADE_OUT_MS = 300;

/**
 * Three-line headline whose middle line cycles through cuisines:
 *
 *   Authentic
 *   <Jollof Rice>           ← fades out, swaps, fades in every 2.2s
 *   delivered in London
 *
 * The inner setTimeout is tracked in a ref so we can cancel it on unmount —
 * otherwise React warns "Can't perform a state update on an unmounted
 * component" if the interval fires within 300ms of navigation away.
 *
 * Fixed-height row prevents the surrounding layout from jumping when a
 * longer cuisine name (e.g. "Pounded Yam") replaces a shorter one.
 */
export function AnimatedHeadline() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const swapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      swapTimeoutRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % CUISINES.length);
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
      <h1 className="text-[28px] font-black leading-tight tracking-tight">Authentic</h1>
      <div className="flex h-10 items-center justify-center overflow-hidden" aria-live="polite">
        <span
          className={cn(
            'text-[28px] font-black tracking-tight transition-all duration-300',
            visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
          )}
        >
          {CUISINES[idx]}
        </span>
      </div>
      <h1 className="text-[28px] font-black leading-tight tracking-tight">delivered in London</h1>
    </div>
  );
}
