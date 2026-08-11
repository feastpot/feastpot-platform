'use client';

import { useCallback } from 'react';

import { API_URL } from '@/lib/env';
import { getOrCreateAnonId } from '@/lib/analytics/anon-id';

/**
 * Fire-and-forget analytics event hook for apps/vendor.
 *
 * Returns a stable `track(eventName, properties?, vendorId?)` function.
 * vendorId is accepted as an optional argument (not resolved from auth here)
 * so the hook can be called from non-hook contexts without access to the
 * auth session.  It is provided by the caller from server-rendered props.
 *
 * PII policy: never pass email, phone, name, or any personal data in
 * `properties`.
 */
export function useTrackEvent() {
  return useCallback(
    (eventName: string, properties?: Record<string, unknown>, vendorId?: string) => {
      const anonVisitorId = getOrCreateAnonId();
      fetch(`${API_URL}/v1/analytics/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName,
          properties: properties ?? {},
          anonVisitorId,
          ...(vendorId ? { vendorId } : {}),
        }),
      }).catch(() => null);
    },
    [],
  );
}
