'use client';

import { useEffect } from 'react';

import { API_URL } from '@/lib/env';
import { drainBuffer } from '@/lib/analytics/event-buffer';

/**
 * Replays buffered analytics events from localStorage on the first page load
 * after they were queued.  Call this from the root layout (via
 * AnalyticsInitializer) so it runs on every navigation, not just on the
 * become-a-vendor page.
 *
 * Uses sendBeacon for replay (same reason as the initial send: survives the
 * current page navigation and is handled by the browser's own queue).
 * Falls back to fetch when sendBeacon is unavailable.
 *
 * Drain-before-replay: the buffer is cleared atomically before the sends so a
 * crash mid-replay doesn't double-fire events on the NEXT page load.
 */
export function useFlushAnalyticsBuffer(): void {
  useEffect(() => {
    const events = drainBuffer();
    if (!events.length) return;

    const url = `${API_URL}/v1/analytics/events`;

    for (const { queuedAt: _ts, ...payload } of events) {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const sent = navigator.sendBeacon(url, blob);
        if (!sent) {
          // sendBeacon queue full: drop rather than re-buffer to avoid loops.
          continue;
        }
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => null);
      }
    }
  }, []); // run once per mount (= once per full page load in Next.js App Router)
}
