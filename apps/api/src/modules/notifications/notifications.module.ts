import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../../prisma/prisma.module';

import { NotificationProcessor } from './notification.processor';
import { NotificationsService } from './notifications.service';
import { EmailProvider } from './providers/email.provider';
import { PushProvider } from './providers/push.provider';
import { SmsProvider } from './providers/sms.provider';
import { WhatsappProvider } from './providers/whatsapp.provider';

/**
 * Notifications module is `@Global()` so any feature module can simply inject
 * `NotificationsService` without re-importing this module everywhere.
 */
@Global()
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    NotificationsService,
    NotificationProcessor,
    EmailProvider,
    WhatsappProvider,
    PushProvider,
    SmsProvider,
  ],
  exports: [NotificationsService, PushProvider, EmailProvider, WhatsappProvider],
})
export class NotificationsModule {}
