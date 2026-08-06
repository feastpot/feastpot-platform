import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VendorMembersModule } from '../vendor-members/vendor-members.module';

import { TermsNoticeProcessor } from './terms-notice.processor';
import { TermsController } from './terms.controller';
import { TermsService } from './terms.service';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, VendorMembersModule],
  controllers: [TermsController],
  providers: [TermsService, TermsNoticeProcessor],
  exports: [TermsService],
})
export class TermsModule {}
