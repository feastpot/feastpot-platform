import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { VendorMembersModule } from '../vendor-members/vendor-members.module';

import { AttributionController } from './attribution.controller';
import { AttributionService } from './attribution.service';

/**
 * @Global so AttributionService is injectable everywhere without each
 * feature module needing to import AttributionModule.
 * Registered once in AppModule (alongside the other global modules).
 */
@Global()
@Module({
  imports: [PrismaModule, AuthModule, VendorMembersModule],
  controllers: [AttributionController],
  providers: [AttributionService],
  exports: [AttributionService],
})
export class AttributionModule {}
