import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StripeModule } from '../../stripe/stripe.module';
import { VendorMembersModule } from '../vendor-members/vendor-members.module';

import { PayoutsService } from './payouts.service';
import { PayoutsController } from './payouts.controller';
import { PayoutBatchProcessor } from './processors/payout-batch.processor';

@Module({
  imports: [PrismaModule, AuthModule, StripeModule, VendorMembersModule],
  controllers: [PayoutsController],
  providers: [PayoutsService, PayoutBatchProcessor],
  exports: [PayoutsService],
})
export class PayoutsModule {}
