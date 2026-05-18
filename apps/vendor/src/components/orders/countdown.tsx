'use client';

import { cn } from '@feastpot/ui';

import { useCountdown, formatMmSs } from '@/hooks/use-countdown';

export interface CountdownProps {
  /** Auto-rejection deadline (Date or ISO string). */
  expiresAt: Date | string;
  /** Fired exactly once when the countdown crosses zero. */
  onExpire?: () => void;
}

/**
 * Visual mm:ss countdown pill for pending order cards.
 *
 * Three urgency tiers driven by the seconds-remaining value (re-uses the
 * shared `useCountdown` hook so we get the once-per-second tick + onExpire
 * edge-trigger for free):
 *   - green / muted (`bg-surface`)             - > 3 minutes left
 *   - amber (`bg-amber-100 text-amber-700`)    - < 3 minutes left
 *   - red, pulsing (`bg-red-100 text-red-600`) - < 1 minute left
 */
export function Countdown({ expiresAt, onExpire }: CountdownProps) {
  const remaining = useCountdown(
    typeof expiresAt === 'string' ? expiresAt : expiresAt,
    onExpire,
  );

  const isUrgent = remaining > 0 && remaining < 180;
  const isAlmostExpired = remaining > 0 && remaining < 60;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold transition-colors',
        isAlmostExpired
          ? 'bg-red-100 text-red-600 animate-pulse'
          : isUrgent
            ? 'bg-amber-100 text-amber-700'
            : 'bg-surface text-mid',
      )}
      aria-label={`Auto-reject in ${formatMmSs(remaining)}`}
    >
      <span aria-hidden>⏱️</span>
      <span className="tabular-nums">{formatMmSs(remaining)}</span>
      {isUrgent && remaining > 0 && (
        <span className="text-[10px] font-medium">Accept now</span>
      )}
    </div>
  );
}
