import type { Job } from 'bull';

/**
 * The exact message Bull uses when its stalled-job recovery force-fails a job
 * that exceeded `maxStalledCount` (see bull's moveStalledJobsToWait script).
 */
export const STALLED_FAILURE_MESSAGE = 'job stalled more than allowable limit';

/**
 * Decide whether a Bull job failure should be reported to Sentry.
 *
 * Two cases warrant an alert:
 *   1. The job exhausted its configured retry budget - a genuine terminal
 *      failure in the handler.
 *   2. The job was force-failed by Bull's stalled-job recovery. These arrive
 *      with `attemptsMade === 0`, so the retry-exhaustion check below never
 *      fires - yet they represent real lost work (the handler may have run
 *      partially or been killed mid-flight) and must NOT accumulate silently
 *      in the failed set, which was the production symptom: a steadily growing
 *      `failed` count that never surfaced to Sentry.
 */
export function shouldReportQueueFailure(job: Job | undefined, err: Error): boolean {
  if (!job) return true;
  if (err?.message === STALLED_FAILURE_MESSAGE) return true;
  return job.attemptsMade >= ((job.opts?.attempts ?? 1) as number);
}
