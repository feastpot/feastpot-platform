'use client';

import { Star } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@feastpot/ui';

export interface StarPickerProps {
  value: number;
  onChange: (n: number) => void;
  ariaLabel: string;
  /** "lg" = 40px finger-friendly stars (primary rating); "sm" = 28px (secondary). */
  size?: 'lg' | 'sm';
  /** Show the descriptive label below the stars (Terrible … Excellent). */
  showLabel?: boolean;
}

const RATING_LABELS = ['Terrible', 'Poor', 'OK', 'Good', 'Excellent'] as const;

/**
 * Interactive 5-star picker. Each star is its own button so screen readers
 * and keyboard users can tab through them; clicked star + all preceding
 * stars fill amber.
 *
 * Tap animation: we drive a brief scale spring from a per-star `popped`
 * state - set on click, cleared 200ms later. Pure CSS via Tailwind's
 * `transition-transform` + a temporary scale class is enough; we don't pull
 * in framer-motion just for this.
 */
export function StarPicker({
  value,
  onChange,
  ariaLabel,
  size = 'lg',
  showLabel = true,
}: StarPickerProps) {
  const [popped, setPopped] = useState<number | null>(null);
  const starSizeClass = size === 'lg' ? 'h-10 w-10' : 'h-7 w-7';

  const handlePick = (n: number) => {
    onChange(n);
    setPopped(n);
    setTimeout(() => setPopped(null), 200);
  };

  const labelIndex = value >= 1 && value <= 5 ? value - 1 : -1;

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1"
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= value;
          const isPopped = popped === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              onClick={() => handlePick(n)}
              className="rounded-full p-1 hover:bg-brand/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
            >
              <Star
                className={cn(
                  'transition-all duration-150 ease-out',
                  starSizeClass,
                  active ? 'fill-amber-400 text-amber-400' : 'text-mid/30',
                  isPopped && 'scale-125',
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {showLabel && (
        <p
          aria-live="polite"
          className={cn(
            'mt-1 text-xs font-medium transition-opacity',
            labelIndex === -1 ? 'opacity-40 text-mid' : 'opacity-100 text-dark',
          )}
        >
          {labelIndex === -1 ? 'Tap to rate' : RATING_LABELS[labelIndex]}
        </p>
      )}
    </div>
  );
}
