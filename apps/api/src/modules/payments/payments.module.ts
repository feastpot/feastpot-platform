import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StripeModule } from '../../stripe/stripe.module';

import { ChargebackDeadlineMonitorService } from './chargeback-deadline-monitor.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookProcessor } from './stripe-webhook.processor';

@Module({
  imports: [PrismaModule, AuthModule, StripeModule],
  controllers: [PaymentsController, StripeWebhookController],
  // ChargebackDeadlineMonitorService is safe to host here: it injects no Bull
  // queue, so the queues.module circular-import hazard doesn't apply.
  providers: [PaymentsService, StripeWebhookProcessor, ChargebackDeadlineMonitorService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
