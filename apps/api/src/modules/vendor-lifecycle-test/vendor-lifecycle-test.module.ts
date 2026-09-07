import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { StripeWebhookProcessorModule } from '../payments/stripe-webhook-processor.module';
import { PayoutsModule } from '../payouts/payouts.module';

import { VendorLifecycleTestController } from './vendor-lifecycle-test.controller';

@Module({
  imports: [OrdersModule, PayoutsModule, StripeWebhookProcessorModule],
  controllers: [VendorLifecycleTestController],
})
export class VendorLifecycleTestModule {}
