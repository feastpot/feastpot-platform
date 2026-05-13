import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';

import {
  COMPLIANCE_QUEUE,
  NOTIFICATIONS_QUEUE,
  PAYOUTS_QUEUE,
  STRIPE_WEBHOOK_QUEUE,
} from './queues/queues.module';
import { bullBoardBasicAuth } from './modules/admin/bull-board.middleware';

import { HealthController } from './health/health.controller';
import { RootController } from './root.controller';
// NotificationsModule is @Global(), so feature modules can inject NotificationsService
// without re-importing it everywhere.
import { PrismaModule } from './prisma/prisma.module';
import { QueuesModule } from './queues/queues.module';

import { AuthModule } from './auth/auth.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AdminModule } from './modules/admin/admin.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { DiscountCodesModule } from './modules/discount-codes/discount-codes.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { EventEnquiriesModule } from './modules/event-enquiries/event-enquiries.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
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
    // SentryModule.forRoot() must come first so other modules see the request
    // hub when their providers are constructed.
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('REDIS_URL');
        if (url) {
          // Upstash / managed Redis: use rediss:// in REDIS_URL for TLS.
          // ioredis auto-enables TLS when the scheme is rediss://.
          return {
            redis: url,
            // Bull’s blocking BRPOPLPUSH/etc. require these on managed Redis.
            settings: { stalledInterval: 30_000 },
          };
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
    BullBoardModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        route: '/admin/queues',
        adapter: ExpressAdapter,
        middleware: bullBoardBasicAuth(cfg),
      }),
    }),
    BullBoardModule.forFeature(
      { name: NOTIFICATIONS_QUEUE, adapter: BullAdapter },
      { name: STRIPE_WEBHOOK_QUEUE, adapter: BullAdapter },
      { name: PAYOUTS_QUEUE, adapter: BullAdapter },
      { name: COMPLIANCE_QUEUE, adapter: BullAdapter },
    ),
    AuthModule,
    UsersModule,
    AddressesModule,
    VendorsModule,
    CatalogueModule,
    OrdersModule,
    PaymentsModule,
    DisputesModule,
    EventEnquiriesModule,
    ComplianceModule,
    PayoutsModule,
    ReviewsModule,
    NotificationsModule,
    LoyaltyModule,
    DiscountCodesModule,
    PushModule,
    WebhooksModule,
    AdminModule,
  ],
  controllers: [RootController, HealthController],
  providers: [
    // Captures unhandled exceptions in HTTP/RPC/WS contexts and forwards them
    // to Sentry before delegating to Nest's default error handling.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
