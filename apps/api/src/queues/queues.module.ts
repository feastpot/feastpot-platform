import { BullModule } from '@nestjs/bull';
import { Global, Module } from '@nestjs/common';

export const NOTIFICATIONS_QUEUE = 'notifications';
export const STRIPE_WEBHOOK_QUEUE = 'stripe-webhooks';
export const PAYOUTS_QUEUE = 'payouts';
export const COMPLIANCE_QUEUE = 'compliance';

// Bound every queue's completed/failed retention so Redis (Upstash) usage stays
// flat. Without removeOnFail the failed ZSET grows forever — the production
// symptom on the compliance queue (failed count creeping 26 → 28 → ...). Keep
// the last 500 failures for debugging/Bull-Board, then trim.
const RETENTION = { removeOnComplete: 1000, removeOnFail: 500 } as const;

const queues = BullModule.registerQueue(
  {
    name: NOTIFICATIONS_QUEUE,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      ...RETENTION,
    },
  },
  { name: STRIPE_WEBHOOK_QUEUE, defaultJobOptions: { ...RETENTION } },
  { name: PAYOUTS_QUEUE, defaultJobOptions: { ...RETENTION } },
  { name: COMPLIANCE_QUEUE, defaultJobOptions: { ...RETENTION } },
);

/**
 * Single global registration of all BullMQ queues.
 *
 * Why global? Legacy @nestjs/bull's BullExplorer re-scans every provider in the
 * application once per BullModule.registerQueue() submodule. Registering the
 * same queue from multiple feature modules causes duplicate `@Process()`
 * handler registration → "Cannot define the same handler twice" at boot.
 * Centralising here side-steps that and keeps queue names in one place.
 */
@Global()
@Module({
  imports: [queues],
  exports: [queues],
})
export class QueuesModule {}
