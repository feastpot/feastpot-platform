import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { LoyaltyCronService } from './loyalty-cron.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';

/**
 * @Global so OrdersService and UsersService can inject LoyaltyService /
 * ReferralService without each having to import LoyaltyModule (which
 * would create a fan-out of identical imports across feature modules).
 *
 * AuthModule is imported (not just relied on globally) because
 * LoyaltyController @UseGuards(SupabaseAuthGuard, RolesGuard) — the guard
 * depends on SupabaseService which AuthModule re-exports. Without this
 * import Nest cannot resolve SupabaseService inside the LoyaltyModule
 * scope and the whole API fails to bootstrap.
 */
@Global()
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, ReferralService, LoyaltyCronService],
  exports: [LoyaltyService, ReferralService],
})
export class LoyaltyModule {}
