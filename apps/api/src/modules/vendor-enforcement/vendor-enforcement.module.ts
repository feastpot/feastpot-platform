import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { VendorEnforcementController } from './vendor-enforcement.controller';
import { VendorEnforcementService } from './vendor-enforcement.service';

/**
 * @Global so VendorVerificationService (and any future automated trigger)
 * can inject VendorEnforcementService without importing this module explicitly.
 */
@Global()
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VendorEnforcementController],
  providers: [VendorEnforcementService],
  exports: [VendorEnforcementService],
})
export class VendorEnforcementModule {}
