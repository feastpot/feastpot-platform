'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Returns the remaining whole seconds until `deadline` (a `Date` or ISO
 * string), updating once per second. Returns `0` when expired. The optional
 * `onExpire` fires once per deadline, including deadlines already expired on mount.
 *
 * Implemented with `setInterval` (not rAF) because we only need 1Hz updates
 * - rAF would burn 60× the wakeups for an identical UI.
 */
export function useCountdown(deadline: Date | string | null, onExpire?: () => void) {
  const [remaining, setRemaining] = useState<number>(() => calcRemaining(deadline));
  const expiredDeadline = useRef<number | null>(null);
  const timestamp =
    deadline instanceof Date ? deadline.getTime() : deadline ? Date.parse(deadline) : null;

  useEffect(() => {
    if (timestamp === null || Number.isNaN(timestamp)) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const next = Math.max(0, Math.floor((timestamp - Date.now()) / 1000));
      setRemaining(next);
      // Keep mutations outside React state updaters, which may be replayed.
      if (next === 0 && onExpire && expiredDeadline.current !== timestamp) {
        expiredDeadline.current = timestamp;
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timestamp, onExpire]);

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
