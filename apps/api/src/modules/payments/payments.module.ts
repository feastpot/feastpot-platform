import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StripeModule } from '../../stripe/stripe.module';

import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookProcessor } from './stripe-webhook.processor';

@Module({
  imports: [PrismaModule, AuthModule, StripeModule],
  controllers: [PaymentsController, StripeWebhookController],
  providers: [PaymentsService, StripeWebhookProcessor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
