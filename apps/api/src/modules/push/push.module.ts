import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { PushController } from './push.controller';

/**
 * Lightweight module exposing the customer-facing subscribe/unsubscribe
 * endpoints. Outbound delivery (turning a server-side event into a push
 * payload) lives in `NotificationsModule#PushProvider` - that module is
 * `@Global()`, so it doesn't need to be imported here.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PushController],
})
export class PushModule {}
