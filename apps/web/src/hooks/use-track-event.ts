'use client';

import { useCallback } from 'react';

import { API_URL } from '@/lib/env';
import { getOrCreateAnonId } from '@/lib/analytics/anon-id';
import { pushToBuffer } from '@/lib/analytics/event-buffer';

/**
 * Fire-and-forget analytics event hook for apps/web.
 *
 * Returns a stable `track(eventName, properties?)` function.
 *
 * Delivery strategy (in order of preference):
 *   1. navigator.sendBeacon: queued by the browser and survives page
 *      navigation. This is the preferred path: events fired just before a
 *      React Router transition (e.g. application_complete leading to a
 *      confirmation page) are not lost even if the network request hasn't
 *      finished yet.
 *   2. fetch: used when sendBeacon is unavailable (rare).
 *      On failure (API unreachable during a cold deploy), the event is pushed
 *      to the localStorage buffer (fp_analytics_queue) and replayed on the
 *      next page load by useFlushAnalyticsBuffer / AnalyticsInitializer.
 *
 * PII policy: never pass email, phone, name, or any personal data in
 * `properties`.
 */
export function useTrackEvent() {
  return useCallback((eventName: string, properties?: Record<string, unknown>) => {
    const anonVisitorId = getOrCreateAnonId();
    const payload = { eventName, properties: properties ?? {}, anonVisitorId };
    const url = `${API_URL}/v1/analytics/events`;

    // sendBeacon: survives navigation and page unload.
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const queued = navigator.sendBeacon(url, blob);
      if (!queued) {
        // Browser rejected the beacon (queue full, policy, etc.): buffer it.
        pushToBuffer({ eventName, properties: properties ?? {}, anonVisitorId });
      }
      return;
    }

    // Fallback: fetch with localStorage buffer on network failure.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      pushToBuffer({ eventName, properties: properties ?? {}, anonVisitorId });
    });
  }, []);
}
