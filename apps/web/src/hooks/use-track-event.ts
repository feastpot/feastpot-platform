'use client';

import { useCallback } from 'react';

import { API_URL } from '@/lib/env';
import { getOrCreateAnonId } from '@/lib/analytics/anon-id';

/**
 * Fire-and-forget analytics event hook for apps/web.
 *
 * Returns a stable `track(eventName, properties?)` function.  Every call
 * posts to POST /v1/analytics/events; failures are silently swallowed so
 * ad-blockers and network errors never break the UI.
 *
 * PII policy: never pass email, phone, name, or any personal data in
 * `properties`.  Use the auto-generated anonymous visitor ID for session
 * correlation - it is resolved here and never needs to be passed by callers.
 */
export function useTrackEvent() {
  return useCallback((eventName: string, properties?: Record<string, unknown>) => {
    const anonVisitorId = getOrCreateAnonId();
    fetch(`${API_URL}/v1/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName, properties: properties ?? {}, anonVisitorId }),
    }).catch(() => null);
  }, []);
}
