import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { Logger } from '@nestjs/common';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import IORedis from 'ioredis';
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
import { HealthzController } from './health/healthz.controller';
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
import { InboxModule } from './modules/inbox/inbox.module';
import { VendorMembersModule } from './modules/vendor-members/vendor-members.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { PushModule } from './modules/push/push.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { UsersModule } from './modules/users/users.module';
import { CoverageModule } from './modules/coverage/coverage.module';
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
    //   short - 10 req/sec per tracker (burst protection against scrapers).
    //   long  - 600 req/min CEILING; RoleThrottlerGuard then takes
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
    // Redis-backed throttler storage. Critical for Autoscale: the default
    // in-process Map counts requests per-instance, so with N instances the
    // effective rate limit is N× the configured value - discount-code
    // validation could be brute-forced at 30× the intended 10/min cap.
    // Falls back to the in-memory storage (forRoot) when REDIS_URL is not
    // set so local dev without Redis still boots.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('REDIS_URL');
        const throttlers = [
          { name: 'short', ttl: 1_000, limit: 10 },
          { name: 'long', ttl: 60_000, limit: 600 },
        ];
        if (!url) {
          // No Redis configured - fall back to per-instance memory storage.
          return { throttlers };
        }
        // Mirror the ioredis settings used by Bull / RedisCacheService: cap
        // reconnection attempts so a misconfigured REDIS_URL doesn't spam
        // the log stream at 1 Hz forever. Without these the rate-limit
        // INCR adds ~2ms per request - well inside the 400ms read SLA.
        const parsed = new URL(url);
        const isTls = parsed.protocol === 'rediss:';
        const redis = new IORedis({
          host: parsed.hostname,
          port: Number(parsed.port || (isTls ? 6380 : 6379)),
          username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
          password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
          tls: isTls ? {} : undefined,
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 3000)),
          reconnectOnError: () => false,
          enableReadyCheck: false,
          lazyConnect: false,
        });
        // Attach an error listener so ioredis doesn't crash the process
        // on transient connection failures (WRONGPASS, ECONNREFUSED, etc.).
        // We deliberately keep the log at warn level - a Redis outage on
        // the rate-limit path is bad, but it shouldn't 500 every request;
        // we degrade to fail-open (see the wrapper below).
        //
        // 60s log throttle. The 2026-05-17 outage was caused by THIS
        // listener firing at ~1Hz with un-throttled `log.warn` calls;
        // pino's sync transport flushes JSON to stderr on every call,
        // which starved the event loop enough to make /livez (a
        // zero-IO SELECT 1) time out at 10s. With this throttle, a
        // permanent WRONGPASS produces 1 log line per minute instead
        // of 60.
        const log = new Logger('ThrottlerRedis');
        let lastErrorLog = 0;
        let lastDegradedLog = 0;
        const THROTTLE_MS = 60_000;
        redis.on('error', (err) => {
          const now = Date.now();
          if (now - lastErrorLog > THROTTLE_MS) {
            lastErrorLog = now;
            log.warn(
              `Redis error on throttler client: ${(err as Error).message} (further errors suppressed for 60s)`,
            );
          }
        });
        const inner = new ThrottlerStorageRedisService(redis);
        // Fail-open wrapper: if the Redis INCR fails for any reason
        // (auth, connectivity, script load), allow the request rather
        // than 500'ing every caller. Throttling is best-effort under a
        // Redis outage - the global `short` window (10 req/sec) is
        // still enforced upstream by Cloudflare / Replit's L7 LB on
        // the deployed path.
        //
        // The `log.warn` here ALSO needs throttling: under real load,
        // every request hits this path, so without the throttle a
        // Redis outage produces N log lines per second where N = RPS.
        const storage: ThrottlerStorage = {
          increment: async (key, ttl, limit, blockDuration, name) => {
            try {
              return await inner.increment(key, ttl, limit, blockDuration, name);
            } catch (err) {
              const now = Date.now();
              if (now - lastDegradedLog > THROTTLE_MS) {
                lastDegradedLog = now;
                log.warn(
                  `Throttler storage degraded - allowing requests: ${(err as Error).message} (further degradation logs suppressed for 60s)`,
                );
              }
              return {
                totalHits: 0,
                timeToExpire: Math.ceil(ttl / 1000),
                isBlocked: false,
                timeToBlockExpire: 0,
              };
            }
          },
        };
        return { throttlers, storage };
      },
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('REDIS_URL');
        // Cap reconnection attempts at the Bull layer too (mirrors
        // RedisCacheService) - without this, a misconfigured REDIS_URL
        // (WRONGPASS, dead host) causes ioredis to retry forever and
        // spam the log stream at 1 Hz, AND blocks Bull's `queue.add()`
        // calls indefinitely so the cron-registration callsites never
        // resolve. After 5 failures we give up.
        const cappedRetry = (times: number): number | null =>
          times > 5 ? null : Math.min(times * 500, 3000);
        if (url) {
          // Bull's `redis` option accepts an ioredis RedisOptions OBJECT
          // (not a `{ url }` shape), so we must parse the URL into
          // host/port/password/tls ourselves - otherwise ioredis silently
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
        // No REDIS_URL set - there is no source of truth for Redis, so
        // Bull is effectively disabled. We still have to return a valid
        // BullModule config (Queue instances are constructed at module
        // load), so we hand back a connection that:
        //   - never auto-connects (`lazyConnect: true`),
        //   - never retries if something does try to use it
        //     (`retryStrategy: () => null`, `maxRetriesPerRequest: 0`),
        //   - never queues commands offline (`enableOfflineQueue: false`).
        // Processors check `cache.available` before registering crons /
        // calling queue.add(), so under this config Bull simply sits idle.
        // The host/port are placeholders that should never actually be
        // dialled - kept on the loopback so any accidental connect attempt
        // fails fast locally instead of hitting an external service.
        return {
          redis: {
            host: '127.0.0.1',
            port: 6379,
            lazyConnect: true,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 0,
            retryStrategy: () => null,
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
    CoverageModule,
    CatalogueModule,
    OrdersModule,
    PaymentsModule,
    DisputesModule,
    EventEnquiriesModule,
    ComplianceModule,
    PayoutsModule,
    ReviewsModule,
    NotificationsModule,
    InboxModule,
    VendorMembersModule,
    LoyaltyModule,
    DiscountCodesModule,
    PushModule,
    WebhooksModule,
    AdminModule,
  ],
  controllers: [RootController, HealthController, HealthzController],
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
