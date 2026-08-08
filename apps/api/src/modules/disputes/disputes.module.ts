import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';

import { DisputeAppealsService } from './dispute-appeals.service';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({
  imports: [PrismaModule, AuthModule, PaymentsModule],
  controllers: [DisputesController],
  providers: [DisputesService, DisputeAppealsService],
  exports: [DisputesService, DisputeAppealsService],
})
export class DisputesModule {}
