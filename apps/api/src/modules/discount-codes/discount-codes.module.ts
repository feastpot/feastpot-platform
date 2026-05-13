import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { DiscountCodesController } from './discount-codes.controller';
import { DiscountCodesService } from './discount-codes.service';

/**
 * @Global so OrdersService can inject DiscountCodesService without each
 * order-related module importing this one — mirrors the LoyaltyModule
 * pattern already in use across the codebase.
 */
@Global()
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DiscountCodesController],
  providers: [DiscountCodesService],
  exports: [DiscountCodesService],
})
export class DiscountCodesModule {}
