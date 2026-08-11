import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

/**
 * @Global so AnalyticsService is injectable in OrdersService and any other
 * feature module without those modules needing to import AnalyticsModule
 * explicitly.  Pattern matches AttributionModule and NotificationsModule.
 * Registered once in AppModule.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
