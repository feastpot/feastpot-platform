import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StripeModule } from '../../stripe/stripe.module';
import { PaymentsModule } from '../payments/payments.module';

import { CateringBookingsController } from './catering-bookings.controller';
import { CateringBookingsService } from './catering-bookings.service';
import { CateringCronService } from './catering-cron.service';

// NotificationsModule (@Global) exports NotificationsService + EmailProvider - no import needed.
// AttributionModule (@Global) exports AttributionService - no import needed.
// CommissionModule (@Global) exports CommissionService - no import needed.

@Module({
  imports: [PrismaModule, AuthModule, StripeModule, PaymentsModule],
  controllers: [CateringBookingsController],
  providers: [CateringBookingsService, CateringCronService],
  exports: [CateringBookingsService],
})
export class CateringBookingsModule {}
