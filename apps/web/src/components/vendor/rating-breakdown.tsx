'use client';

import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@feastpot/ui';

export interface RatingBreakdownProps {
  avgRating: number;
  reviewCount: number;
  /**
   * Per-star bucket counts. If omitted (the API doesn't expose buckets yet),
   * the component derives a deterministic visual estimate from `avgRating`
   * and `reviewCount` and renders a small "estimated distribution" footnote
   * so we never imply we have data we don't.
   */
  breakdown?: { 5: number; 4: number; 3: number; 2: number; 1: number };
}

/**
 * Vendor profile rating breakdown.
 *
 * Layout: large average + 5 stars + count on the left, horizontal bars per
 * star bucket on the right. Bars animate in on mount (width 0 → final
 * width) with a staggered 0.3s-per-row delay so the eye traces top → bottom.
 */
export function RatingBreakdown({
  avgRating,
  reviewCount,
  breakdown,
}: RatingBreakdownProps) {
  const buckets =
    breakdown ?? estimateBreakdown(avgRating, reviewCount);
  const isEstimated = !breakdown;

  // Drive the width animation off a `mounted` flag — we deliberately render
  // at width 0 on first paint, then flip to the real width via state so the
  // CSS `transition-[width]` engages. We can't use `animate-` classes here
  // because the target width is data-dependent.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  if (reviewCount === 0) {
    return (
      <section className="rounded-2xl border border-border bg-white p-4 text-sm text-mid">
        No reviews yet — be the first to share your experience after delivery.
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-border bg-white p-4"
      aria-label="Rating breakdown"
    >
      <div className="flex items-stretch gap-4">
        {/* Left — big average */}
        <div className="flex w-24 shrink-0 flex-col items-center justify-center border-r border-border pr-4">
          <div className="text-5xl font-extrabold leading-none tracking-tight text-dark">
            {avgRating.toFixed(1)}
          </div>
          <div className="mt-1.5 inline-flex items-center gap-0.5" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  'h-3.5 w-3.5',
                  i < Math.round(avgRating) ? 'fill-amber-400 text-amber-400' : 'text-mid/30',
                )}
              />
            ))}
          </div>
          <div className="mt-1 text-[11px] text-mid">
            {reviewCount.toLocaleString()} review{reviewCount === 1 ? '' : 's'}
          </div>
        </div>

        {/* Right — bars */}
        <ul className="flex-1 space-y-1.5">
          {([5, 4, 3, 2, 1] as const).map((star, idx) => {
            const count = buckets[star];
            const pct = reviewCount > 0 ? (count / reviewCount) * 100 : 0;
            return (
              <li key={star} className="flex items-center gap-2 text-xs text-mid">
                <span className="w-3 text-right tabular-nums">{star}</span>
                <Star
                  className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400"
                  aria-hidden
                />
                <div className="flex-1 overflow-hidden rounded-full bg-surface" aria-hidden>
                  <div
                    className="h-1.5 rounded-full bg-brand transition-[width] duration-700 ease-out"
                    style={{
                      width: mounted ? `${pct}%` : '0%',
                      // Stagger the animation so rows fill in top-to-bottom.
                      transitionDelay: `${idx * 0.12}s`,
                    }}
                  />
                </div>
                <span className="w-8 text-right tabular-nums text-mid">
                  {count.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {isEstimated && (
        <p className="mt-3 text-[10px] text-mid">
          Distribution estimated from average rating — exact counts coming soon.
        </p>
      )}
    </section>
  );
}

/**
 * Deterministic visual estimator for per-star bucket counts.
 *
 * The vendor list/profile API exposes only `rating` and `ratingCount` today.
 * Until per-bucket counts ship, we generate a smooth distribution centred on
 * the actual average using a Gaussian-ish weighting (variance fixed at 0.6).
 * The bars are visually plausible AND consistent every render for the same
 * inputs, but the footnote tells customers they're estimated.
 */
function estimateBreakdown(
  avg: number,
  total: number,
): { 5: number; 4: number; 3: number; 2: number; 1: number } {
  const sigma2 = 0.6 * 0.6;
  const weights = ([1, 2, 3, 4, 5] as const).map((star) => {
    const d = star - avg;
    return Math.exp(-(d * d) / (2 * sigma2));
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;

  // Two-pass: floor to avoid over-allocating, then assign the remainder to
  // the buckets with the largest fractional parts. Guarantees the bars sum
  // to `total` exactly so the visual + the headline count agree.
  const raw = weights.map((w) => (w / sum) * total);
  const floored = raw.map(Math.floor);
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const fractional = raw.map((v, i) => ({ i, frac: v - Math.floor(v) }));
  fractional.sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder && k < fractional.length; k++) {
    const entry = fractional[k];
    if (entry) floored[entry.i] = (floored[entry.i] ?? 0) + 1;
  }

  return {
    1: floored[0] ?? 0,
    2: floored[1] ?? 0,
    3: floored[2] ?? 0,
    4: floored[3] ?? 0,
    5: floored[4] ?? 0,
  };
}
