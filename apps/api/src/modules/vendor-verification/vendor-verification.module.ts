import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { VendorVerificationController } from './vendor-verification.controller';
import { VendorVerificationService } from './vendor-verification.service';

@Global()
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VendorVerificationController],
  providers: [VendorVerificationService],
  exports: [VendorVerificationService],
})
export class VendorVerificationModule {}
