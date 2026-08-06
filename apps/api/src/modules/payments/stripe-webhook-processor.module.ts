import { Module } from '@nestjs/common';

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
  providers: [StripeWebhookProcessor],
})
export class StripeWebhookProcessorModule {}
