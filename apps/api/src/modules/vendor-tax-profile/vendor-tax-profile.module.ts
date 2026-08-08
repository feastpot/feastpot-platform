import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { HMRC_QUEUE } from '../../queues/queues.module';
import { StripeModule } from '../../stripe/stripe.module';

import { HmrcReportProcessor } from './hmrc-report.processor';
import { HmrcReportService } from './hmrc-report.service';
import { VendorTaxProfileController } from './vendor-tax-profile.controller';
import { VendorTaxProfileService } from './vendor-tax-profile.service';

/**
 * Handles HMRC digital platform reporting (SI 2023/817):
 *   - Tax profile collection + Stripe prefill
 *   - Compliance verification
 *   - Annual report generation and vendor copy distribution
 *
 * NotificationsService is @Global - injectable without import.
 * RedisCacheService is @Global - injectable without import.
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    StripeModule,
    // The HMRC queue must be registered here for the processor.
    // The queue itself is defined in QueuesModule (which is @Global),
    // so we only need the BullModule reference for @InjectQueue binding.
    BullModule.registerQueue({ name: HMRC_QUEUE }),
  ],
  controllers: [VendorTaxProfileController],
  providers: [VendorTaxProfileService, HmrcReportService, HmrcReportProcessor],
  exports: [VendorTaxProfileService, HmrcReportService],
})
export class VendorTaxProfileModule {}
