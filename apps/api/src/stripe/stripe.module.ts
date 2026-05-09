import { Global, Module } from '@nestjs/common';

import { StripeService, stripeClientFactory } from './stripe.service';

@Global()
@Module({
  providers: [stripeClientFactory, StripeService],
  exports: [StripeService],
})
export class StripeModule {}
