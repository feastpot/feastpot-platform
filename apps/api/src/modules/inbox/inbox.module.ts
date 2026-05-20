import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

/**
 * T007: @Global() so any feature module can fire-and-forget
 * `inbox.notify(...)` without re-importing this everywhere (same pattern
 * as NotificationsModule).
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [InboxController],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
