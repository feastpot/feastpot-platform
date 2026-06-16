/**
 * One-off operational cleanup: drain the historical `failed` jobs that piled
 * up on the BullMQ queues before the root-cause fix (lockDuration > stalledInterval)
 * stopped the `failed` count from growing.
 *
 * Those pre-existing failures linger in Redis (Upstash) until they age out via
 * the newly-added `removeOnFail: 500` retention. This script removes them now so
 * `/v1/healthz` reads clean immediately and Upstash memory is freed.
 *
 * SAFETY:
 *   - DRY-RUN by default. It prints a full report of every failed job (id, name,
 *     failedReason, attempts, timestamps, data) and writes it to a JSON file so
 *     no genuine, still-actionable failure is discarded without being noted.
 *   - Pass `--apply` to actually remove the failed jobs.
 *   - Pass `--queue=<name>` (repeatable) to limit to specific queues.
 *
 * Usage (from repo root or apps/api):
 *   ts-node apps/api/scripts/clean-failed-jobs.ts            # dry-run, report only
 *   ts-node apps/api/scripts/clean-failed-jobs.ts --apply    # actually drain
 *
 * The same REDIS_URL is shared by development and the production deployment
 * (single Upstash instance, queue keys namespaced by queue name), so running
 * this against the configured REDIS_URL cleans the production queues.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import Queue, { type QueueOptions, type Job } from 'bull';

const ALL_QUEUES = ['notifications', 'stripe-webhooks', 'payouts', 'compliance'] as const;

interface RedisConn {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

function redisConnFromUrl(url: string): RedisConn {
  const parsed = new URL(url);
  const isTls = parsed.protocol === 'rediss:';
  return {
    host: parsed.hostname,
    port: Number(parsed.port || (isTls ? 6380 : 6379)),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    tls: isTls ? {} : undefined,
  };
}

interface FailedJobNote {
  queue: string;
  id: string | number;
  name: string;
  attemptsMade: number;
  timestamp: string | null;
  finishedOn: string | null;
  failedReason: string | undefined;
  firstStackLine: string | undefined;
  data: unknown;
}

function noteJob(queueName: string, job: Job): FailedJobNote {
  const stack = job.stacktrace?.[0];
  return {
    queue: queueName,
    id: job.id,
    name: job.name,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    failedReason: job.failedReason,
    firstStackLine: typeof stack === 'string' ? stack.split('\n')[0] : undefined,
    data: job.data,
  };
}

async function main(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error('REDIS_URL is not set — nothing to connect to. Aborting.');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  const queueFilters = process.argv
    .filter((a) => a.startsWith('--queue='))
    .map((a) => a.slice('--queue='.length));
  const targets = queueFilters.length
    ? ALL_QUEUES.filter((q) => queueFilters.includes(q))
    : [...ALL_QUEUES];

  if (queueFilters.length && targets.length !== queueFilters.length) {
    const unknown = queueFilters.filter((q) => !ALL_QUEUES.includes(q as never));
    console.error(`Unknown queue name(s): ${unknown.join(', ')}. Valid: ${ALL_QUEUES.join(', ')}`);
    process.exit(1);
  }

  const conn = redisConnFromUrl(url);
  console.log(`Connecting to Redis at ${conn.host}:${conn.port} (tls=${!!conn.tls})`);
  console.log(`Mode: ${apply ? 'APPLY (jobs will be removed)' : 'DRY-RUN (no changes)'}`);
  console.log(`Queues: ${targets.join(', ')}\n`);

  const allNotes: FailedJobNote[] = [];
  const summary: Array<{
    queue: string;
    failedBefore: number;
    removed: number;
    failedAfter: number;
  }> = [];

  for (const name of targets) {
    const q = new Queue(name, { redis: conn as QueueOptions['redis'] });
    try {
      const failedBefore = await q.getFailedCount();
      const failed = await q.getFailed(0, Math.max(failedBefore - 1, 0));
      console.log(`[${name}] failed jobs: ${failedBefore}`);

      for (const job of failed) {
        const note = noteJob(name, job);
        allNotes.push(note);
        console.log(
          `  - id=${note.id} name=${note.name} attempts=${note.attemptsMade} ` +
            `finishedOn=${note.finishedOn ?? 'n/a'} reason=${note.failedReason ?? 'n/a'}`,
        );
      }

      let removed = 0;
      if (apply && failed.length) {
        for (const job of failed) {
          await job.remove();
          removed += 1;
        }
      }

      const failedAfter = await q.getFailedCount();
      summary.push({ queue: name, failedBefore, removed, failedAfter });
      console.log('');
    } finally {
      await q.close();
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  // Write the audit report to the repo-root `.local/` dir, which is gitignored.
  // The report includes raw job.data (notification payloads can contain
  // recipient emails/phone numbers) so it must NOT land in version control.
  const reportDir = join(__dirname, '..', '..', '..', '.local');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, `failed-jobs-report-${ts}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: apply ? 'apply' : 'dry-run',
        summary,
        jobs: allNotes,
      },
      null,
      2,
    ),
  );

  console.log('=== Summary ===');
  for (const s of summary) {
    console.log(`${s.queue}: before=${s.failedBefore} removed=${s.removed} after=${s.failedAfter}`);
  }
  console.log(`\nFull report (${allNotes.length} failed jobs noted) written to:\n  ${reportPath}`);
  if (!apply) {
    console.log('\nDRY-RUN only — re-run with --apply to actually drain these failed jobs.');
  }
}

main().catch((e) => {
  console.error('clean-failed-jobs error:', e?.message ?? e);
  process.exit(2);
});
