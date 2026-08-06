import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { CateringEnquiriesController } from './catering-enquiries.controller';
import { CateringEnquiriesService } from './catering-enquiries.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CateringEnquiriesController],
  providers: [CateringEnquiriesService],
  exports: [CateringEnquiriesService],
})
export class CateringEnquiriesModule {}
