import { BullModule } from '@nestjs/bull';
import { Global, Module } from '@nestjs/common';

export const NOTIFICATIONS_QUEUE = 'notifications';
export const STRIPE_WEBHOOK_QUEUE = 'stripe-webhooks';
export const PAYOUTS_QUEUE = 'payouts';

const queues = BullModule.registerQueue(
  { name: NOTIFICATIONS_QUEUE },
  { name: STRIPE_WEBHOOK_QUEUE },
  { name: PAYOUTS_QUEUE },
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
