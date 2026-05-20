import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { VendorMembersController } from './vendor-members.controller';
import { VendorMembersService } from './vendor-members.service';

@Module({
  imports: [PrismaModule],
  controllers: [VendorMembersController],
  providers: [VendorMembersService],
  exports: [VendorMembersService],
})
export class VendorMembersModule {}
