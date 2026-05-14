import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { LoyaltyCronService } from './loyalty-cron.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';

/**
 * @Global so OrdersService and UsersService can inject LoyaltyService /
 * ReferralService without each having to import LoyaltyModule (which
 * would create a fan-out of identical imports across feature modules).
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, ReferralService, LoyaltyCronService],
  exports: [LoyaltyService, ReferralService],
})
export class LoyaltyModule {}
