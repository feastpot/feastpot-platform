import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StripeModule } from '../stripe/stripe.module';

import { FeastPassController } from './feastpass.controller';
import { FeastPassService } from './feastpass.service';

// @Global so FeastPassService is injectable in OrdersService and
// StripeWebhookProcessor without each feature module importing FeastPassModule.
@Global()
@Module({
  imports: [PrismaModule, AuthModule, StripeModule],
  controllers: [FeastPassController],
  providers: [FeastPassService],
  exports: [FeastPassService],
})
export class FeastPassModule {}
