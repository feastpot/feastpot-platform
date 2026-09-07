import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { CateringEnquiriesController } from './catering-enquiries.controller';
import { CateringEnquiriesService } from './catering-enquiries.service';
import { CateringEnquiryExpiryService } from './catering-enquiry-expiry.service';

@Module({
  imports: [PrismaModule, AuthModule],
  // NotificationsModule is @Global() so NotificationsService is available
  // without re-importing it here.
  controllers: [CateringEnquiriesController],
  providers: [CateringEnquiriesService, CateringEnquiryExpiryService],
  exports: [CateringEnquiriesService],
})
export class CateringEnquiriesModule {}
