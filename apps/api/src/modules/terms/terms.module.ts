import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { VendorMembersModule } from '../vendor-members/vendor-members.module';

import { PlatformFactsController } from './platform-facts.controller';
import { TermsNoticeProcessor } from './terms-notice.processor';
import { TermsController } from './terms.controller';
import { TermsService } from './terms.service';

@Module({
  imports: [PrismaModule, AuthModule, VendorMembersModule],
  controllers: [TermsController, PlatformFactsController],
  providers: [TermsService, TermsNoticeProcessor],
  exports: [TermsService],
})
export class TermsModule {}
