export interface QueueHealthReading {
  waiting: number;
  active: number;
  failed: number;
  isPaused: boolean;
}

export interface QueueHealthHistory {
  noConsumerSince: number | null;
  lastObservedAt: number;
  failedSamples: Array<{ at: number; count: number }>;
}

const TEN_MINUTES = 10 * 60_000;
const FIFTEEN_MINUTES = 15 * 60_000;
// The cron runs every five minutes. A missed poll breaks the continuity proof.
const MAX_POLL_GAP = 7 * 60_000;

export function assessQueueHealth(
  current: QueueHealthReading,
  previous: QueueHealthHistory | null,
  now: number,
): {
  history: QueueHealthHistory;
  noConsumer: boolean;
  waitingAbove50: boolean;
  failedCountRose: boolean;
  failedWindowBaseline: number | null;
} {
  const continuous =
    previous !== null &&
    now >= previous.lastObservedAt &&
    now - previous.lastObservedAt <= MAX_POLL_GAP;
  const idleWithBacklog = current.waiting > 0 && current.active === 0;
  const noConsumerSince = idleWithBacklog
    ? continuous
      ? (previous.noConsumerSince ?? now)
      : now
    : null;
  const failedSamples = (previous?.failedSamples ?? []).filter(
    (sample) => sample.at >= now - FIFTEEN_MINUTES && sample.at < now,
  );
  const failedWindowBaseline = failedSamples.length
    ? Math.min(...failedSamples.map((sample) => sample.count))
    : null;
  return {
    history: {
      noConsumerSince,
      lastObservedAt: now,
      failedSamples: [...failedSamples, { at: now, count: current.failed }].slice(-16),
    },
    noConsumer: noConsumerSince !== null && now - noConsumerSince >= TEN_MINUTES,
    waitingAbove50: current.waiting > 50,
    failedCountRose: failedWindowBaseline !== null && current.failed > failedWindowBaseline,
    failedWindowBaseline,
  };
}
