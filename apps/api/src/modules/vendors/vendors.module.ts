import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { VendorsController } from './vendors.controller';
import { VendorRepository } from './vendors.repository';
import { VendorsService } from './vendors.service';

@Module({
  imports: [PrismaModule],
  controllers: [VendorsController],
  providers: [VendorsService, VendorRepository],
  exports: [VendorsService],
})
export class VendorsModule {}
