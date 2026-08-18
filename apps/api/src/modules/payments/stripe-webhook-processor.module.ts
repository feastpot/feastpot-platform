import { Module } from '@nestjs/common';

import { PaymentsModule } from './payments.module';
import { StripeWebhookProcessor } from './stripe-webhook.processor';

/**
 * Hosts StripeWebhookProcessor in isolation so the BullExplorer only
 * registers its @Process handlers ONCE. PaymentsModule is imported by
 * OrdersModule (forwardRef) and DisputesModule; if StripeWebhookProcessor
 * lived there it would be scanned multiple times → "Cannot define the
 * same handler twice" at boot.
 *
 * PrismaModule and StripeModule are both @Global() so the processor can
 * inject PrismaService and LoyaltyService without explicit imports here.
 * This module is registered ONLY in AppModule.imports.
 */
@Module({
  // PaymentsModule provides PaymentsService (external-refund reconciliation +
  // failed-refund compensation). Safe: PaymentsModule does not import this
  // module back, and the processor stays registered exactly once here.
  imports: [PaymentsModule],
  providers: [StripeWebhookProcessor],
})
export class StripeWebhookProcessorModule {}
