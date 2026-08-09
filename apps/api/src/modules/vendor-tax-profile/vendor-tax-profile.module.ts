import { Module } from '@nestjs/common';

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
    // Do NOT call BullModule.registerQueue here. HMRC_QUEUE is already
    // registered in the @Global QueuesModule, which exports all queue
    // providers. A second BullModule.registerQueue call from any feature
    // module creates a second BullExplorer instance that re-scans every
    // @Process handler across the app and throws "Cannot define the same
    // handler twice" at boot. The global QueuesModule export is sufficient
    // for @InjectQueue(HMRC_QUEUE) to resolve.
  ],
  controllers: [VendorTaxProfileController],
  providers: [VendorTaxProfileService, HmrcReportService, HmrcReportProcessor],
  exports: [VendorTaxProfileService, HmrcReportService],
})
export class VendorTaxProfileModule {}
