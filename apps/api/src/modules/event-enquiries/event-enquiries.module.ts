import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { EventCronService } from './event-cron.service';
import { EventEnquiriesController } from './event-enquiries.controller';
import { EventEnquiriesService } from './event-enquiries.service';

@Module({
  imports: [PrismaModule],
  controllers: [EventEnquiriesController],
  providers: [EventEnquiriesService, EventCronService],
  exports: [EventEnquiriesService],
})
export class EventEnquiriesModule {}
