import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { LoggerModule } from 'nestjs-pino';

import {
  COMPLIANCE_QUEUE,
  NOTIFICATIONS_QUEUE,
  PAYOUTS_QUEUE,
  STRIPE_WEBHOOK_QUEUE,
} from './queues/queues.module';
import { bullBoardBasicAuth } from './modules/admin/bull-board.middleware';

import { CacheModule } from './common/cache/cache.module';
import { RoleThrottlerGuard } from './common/guards/role-throttler.guard';
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
    // Pino structured JSON logging. Production emits one JSON object per
    // line (ingestable by Datadog / Loki / Sentry log forwarder); dev uses
    // pino-pretty for human-readable colourised output. We redact the
    // Authorization header and Cookie so bearer tokens can never leak to
    // the log pipeline.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        serializers: {
          req: (req: { method: string; url: string; id: unknown }) => ({
            method: req.method,
            url: req.url,
            id: req.id,
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
        customProps: (req) => ({
          userId: (req as { user?: { id?: string } }).user?.id,
          role: (req as { user?: { role?: string } }).user?.role,
        }),
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    // Two-tier rate limiting:
    //   short — 10 req/sec per tracker (burst protection against scrapers).
    //   long  — 600 req/min CEILING; RoleThrottlerGuard then takes
    //           min(roleCap, routeLimit) so it tightens per role
    //           (anon 30 / customer 120 / vendor 300 / admin-tier 600)
    //           AND so route-level @Throttle({ long: { limit: N } }) wins
    //           when N is stricter (e.g. 10/min anti-enumeration on
    //           /v1/discount-codes/validate).
    //
    // The default is set to 600 (not 300) on purpose: it's the ceiling
    // for the highest-trust roles. Lower roles are clamped down by the
    // guard's role cap. Setting the module default to 300 would silently
    // collapse admin/finance/compliance/support to 300 on any route that
    // doesn't explicitly opt into a looser @Throttle.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 1_000, limit: 10 },
        { name: 'long', ttl: 60_000, limit: 600 },
      ],
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('REDIS_URL');
        // Cap reconnection attempts at the Bull layer too (mirrors
        // RedisCacheService) — without this, a misconfigured REDIS_URL
        // (WRONGPASS, dead host) causes ioredis to retry forever and
        // spam the log stream at 1 Hz, AND blocks Bull's `queue.add()`
        // calls indefinitely so the cron-registration callsites never
        // resolve. After 5 failures we give up.
        const cappedRetry = (times: number): number | null =>
          times > 5 ? null : Math.min(times * 500, 3000);
        if (url) {
          // Bull's `redis` option accepts an ioredis RedisOptions OBJECT
          // (not a `{ url }` shape), so we must parse the URL into
          // host/port/password/tls ourselves — otherwise ioredis silently
          // falls back to 127.0.0.1:6379, which on Replit is unreachable
          // and produces an unhandled `ECONNREFUSED` that crashes the
          // process. `rediss://` (TLS) is mapped to `tls: {}`; ioredis
          // upgrades the socket when `tls` is present.
          const parsed = new URL(url);
          const isTls = parsed.protocol === 'rediss:';
          return {
            redis: {
              host: parsed.hostname,
              port: Number(parsed.port || (isTls ? 6380 : 6379)),
              username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
              password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
              tls: isTls ? {} : undefined,
              maxRetriesPerRequest: 3,
              retryStrategy: cappedRetry,
              reconnectOnError: () => false,
              enableReadyCheck: false,
            },
            // Bull's blocking BRPOPLPUSH/etc. require these on managed Redis.
            settings: { stalledInterval: 30_000 },
          };
        }
        return {
          redis: {
            host: cfg.get<string>('REDIS_HOST') ?? '127.0.0.1',
            port: Number(cfg.get<string>('REDIS_PORT') ?? 6379),
            password: cfg.get<string>('REDIS_PASSWORD'),
            maxRetriesPerRequest: 3,
            retryStrategy: cappedRetry,
            reconnectOnError: () => false,
            enableReadyCheck: false,
          },
        };
      },
    }),
    PrismaModule,
    QueuesModule,
    CacheModule,
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
    // Registered AFTER AuthModule's APP_GUARDs (SupabaseAuthGuard, RolesGuard)
    // so req.user is populated by the time the throttler reads it for the
    // role-aware limit calculation.
    { provide: APP_GUARD, useClass: RoleThrottlerGuard },
  ],
})
export class AppModule {}
