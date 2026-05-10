'use client';

import { useEffect, useState } from 'react';

/**
 * Returns the remaining whole seconds until `deadline` (a `Date` or ISO
 * string), updating once per second. Returns `0` when expired. The optional
 * `onExpire` callback fires exactly once when the countdown crosses zero.
 *
 * Implemented with `setInterval` (not rAF) because we only need 1Hz updates
 * — rAF would burn 60× the wakeups for an identical UI.
 */
export function useCountdown(deadline: Date | string | null, onExpire?: () => void) {
  const [remaining, setRemaining] = useState<number>(() => calcRemaining(deadline));

  useEffect(() => {
    if (!deadline) {
      setRemaining(0);
      return;
    }
    setRemaining(calcRemaining(deadline));
    const id = setInterval(() => {
      setRemaining((prev) => {
        const next = calcRemaining(deadline);
        // Edge-trigger the expire callback exactly once.
        if (prev > 0 && next === 0 && onExpire) onExpire();
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [deadline, onExpire]);

  return remaining;
}

function calcRemaining(deadline: Date | string | null): number {
  if (!deadline) return 0;
  const ts = typeof deadline === 'string' ? Date.parse(deadline) : deadline.getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.floor((ts - Date.now()) / 1000));
}

export function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
