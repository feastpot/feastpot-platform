'use client';

import { useFlushAnalyticsBuffer } from '@/hooks/use-flush-analytics-buffer';

/**
 * Thin client component that lives in the root layout.
 * Its only job is to call useFlushAnalyticsBuffer() once per page load so
 * events queued during an API blip are replayed on the user's next visit.
 * Renders nothing visible.
 */
export function AnalyticsInitializer() {
  useFlushAnalyticsBuffer();
  return null;
}
