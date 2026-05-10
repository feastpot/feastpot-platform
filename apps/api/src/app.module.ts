import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './health/health.controller';
import { RootController } from './root.controller';
// NotificationsModule is @Global(), so feature modules can inject NotificationsService
// without re-importing it everywhere.
import { PrismaModule } from './prisma/prisma.module';
import { QueuesModule } from './queues/queues.module';

import { AuthModule } from './auth/auth.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { PushModule } from './modules/push/push.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { UsersModule } from './modules/users/users.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('REDIS_URL');
        if (url) {
          return { url };
        }
        return {
          redis: {
            host: cfg.get<string>('REDIS_HOST') ?? '127.0.0.1',
            port: Number(cfg.get<string>('REDIS_PORT') ?? 6379),
            password: cfg.get<string>('REDIS_PASSWORD'),
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
        };
      },
    }),
    PrismaModule,
    QueuesModule,
    AuthModule,
    UsersModule,
    VendorsModule,
    CatalogueModule,
    OrdersModule,
    PaymentsModule,
    DisputesModule,
    ComplianceModule,
    PayoutsModule,
    ReviewsModule,
    NotificationsModule,
    PushModule,
    WebhooksModule,
  ],
  controllers: [RootController, HealthController],
})
export class AppModule {}
