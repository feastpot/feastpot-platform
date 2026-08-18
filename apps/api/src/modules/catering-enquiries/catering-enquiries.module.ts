import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { CateringEnquiriesController } from './catering-enquiries.controller';
import { CateringEnquiriesService } from './catering-enquiries.service';

@Module({
  imports: [PrismaModule, AuthModule],
  // NotificationsModule is @Global() so NotificationsService is available
  // without re-importing it here.
  controllers: [CateringEnquiriesController],
  providers: [CateringEnquiriesService],
  exports: [CateringEnquiriesService],
})
export class CateringEnquiriesModule {}
