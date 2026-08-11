/**
 * localStorage-backed analytics event buffer.
 *
 * When the analytics API endpoint is unreachable (deploy cold start, network
 * blip), failed events are written here and replayed on the next page load by
 * useFlushAnalyticsBuffer().
 *
 * Design constraints:
 *   - Max 20 events (oldest dropped when full, so low-value events like
 *     calculator_interaction do not crowd out application_complete).
 *   - 30-minute TTL: stale events are silently discarded on drain.
 *   - No PII in the stored payload (same policy as the live track() call).
 *   - All localStorage access is wrapped in try/catch; a blocked or
 *     quota-exceeded storage never throws to callers.
 */

const BUFFER_KEY = 'fp_analytics_queue';
const MAX_EVENTS = 20;
const TTL_MS = 30 * 60 * 1_000; // 30 min

export interface BufferedEvent {
  eventName: string;
  properties: Record<string, unknown>;
  anonVisitorId: string;
  queuedAt: number;
}

function readQueue(): BufferedEvent[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BUFFER_KEY) : null;
    if (!raw) return [];
    return JSON.parse(raw) as BufferedEvent[];
  } catch {
    return [];
  }
}

function writeQueue(queue: BufferedEvent[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BUFFER_KEY, JSON.stringify(queue));
    }
  } catch {
    // Quota exceeded or storage blocked: silently skip.
  }
}

/**
 * Append an event to the buffer.
 * Drops entries older than TTL and enforces the MAX_EVENTS cap (oldest first).
 */
export function pushToBuffer(event: Omit<BufferedEvent, 'queuedAt'>): void {
  const queue = readQueue()
    .filter((e) => Date.now() - e.queuedAt < TTL_MS); // prune stale

  while (queue.length >= MAX_EVENTS) queue.shift(); // cap: drop oldest

  queue.push({ ...event, queuedAt: Date.now() });
  writeQueue(queue);
}

/**
 * Remove all buffered events and return the non-stale ones for replay.
 * Clears the queue before returning so a crash during replay doesn't
 * cause duplicate sends on the next load.
 */
export function drainBuffer(): BufferedEvent[] {
  const queue = readQueue();
  writeQueue([]); // clear immediately; replay is best-effort
  return queue.filter((e) => Date.now() - e.queuedAt < TTL_MS);
}
