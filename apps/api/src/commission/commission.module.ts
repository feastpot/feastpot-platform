import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { CommissionService } from './commission.service';

/**
 * @Global so CommissionService is injectable everywhere without each module
 * needing to explicitly import CommissionModule.
 * Registered once in AppModule imports.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [CommissionService],
  exports: [CommissionService],
})
export class CommissionModule {}
