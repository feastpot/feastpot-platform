import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { VendorRecommendationsController } from './vendor-recommendations.controller';
import { VendorRecommendationsService } from './vendor-recommendations.service';

@Module({
  imports: [PrismaModule],
  controllers: [VendorRecommendationsController],
  providers: [VendorRecommendationsService],
  exports: [VendorRecommendationsService],
})
export class VendorRecommendationsModule {}
