import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { StripeModule } from '../../stripe/stripe.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DlqMonitorService } from './dlq-monitor.service';

@Module({
  imports: [PrismaModule, StripeModule],
  controllers: [AdminController],
  providers: [AdminService, DlqMonitorService],
})
export class AdminModule {}
