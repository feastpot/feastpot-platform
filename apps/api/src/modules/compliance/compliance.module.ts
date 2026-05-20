import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { VendorMembersModule } from '../vendor-members/vendor-members.module';

import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { ComplianceProcessor } from './processors/compliance.processor';

@Module({
  imports: [PrismaModule, AuthModule, VendorMembersModule],
  controllers: [ComplianceController],
  providers: [ComplianceService, ComplianceProcessor],
  exports: [ComplianceService],
})
export class ComplianceModule {}
