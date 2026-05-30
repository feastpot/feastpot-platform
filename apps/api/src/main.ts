// Sentry must be required before anything else so its OpenTelemetry
// auto-instrumentation can hook into Node's module loader.
import './instrument';
import 'reflect-metadata';

import compression from 'compression';
import express from 'express';
import helmet from 'helmet';

// Bull v3 spins up three ioredis connections per queue (client, subscriber,
// bclient). When REDIS_URL has bad credentials, AUTH fails on all three -
// but Bull only attaches an `error` listener to its main `client`, so the
// AUTH failure on the bclient/subscriber bubbles up as an unhandled
// `ReplyError: WRONGPASS` and crashes the entire process. We don't want a
// misconfigured Redis URL to take the whole API down (HTTP routes that
// don't touch queues still work fine), so swallow ONLY Redis-auth-style
// errors at the process boundary. Everything else (Postgres ECONNREFUSED,
// SMTP ENOTFOUND, real bugs) still terminates as normal so we never mask
// a non-Redis failure as benign.
const isBenignRedisError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const message = String((err as { message?: unknown }).message ?? '');
  // Redis-protocol auth errors are unambiguous - they only come from a
  // Redis server and never from Postgres/HTTP/etc.
  if (/\b(WRONGPASS|NOAUTH|NOPERM|MOVED|CLUSTERDOWN|READONLY)\b/.test(message)) {
    return true;
  }
  // ioredis tags its own ReplyError instances with `name === 'ReplyError'`
  // and attaches a `command` of the form `{ name: 'auth', args: [...] }`.
  // That combination is uniquely Redis.
  const name = String((err as { name?: unknown }).name ?? '');
  const command = (err as { command?: { name?: unknown } }).command;
  if (name === 'ReplyError' && command && typeof command.name === 'string') {
    return true;
  }
  // ECONNREFUSED to the standard Redis ports (6379 plain, 6380 TLS) is
  // unambiguously a Redis connection - Postgres is 5432, SMTP is
  // 25/465/587, etc. Catching this means a dev env without REDIS_URL
  // doesn't crash from Bull's eager localhost-fallback connect attempt
  // (which otherwise produces an `uncaughtException` Node 22 surfaces).
  const net = err as { code?: unknown; port?: unknown };
  if (
    String(net.code ?? '') === 'ECONNREFUSED' &&
    (net.port === 6379 || net.port === 6380)
  ) {
    return true;
  }
  return false;
};
// Rate-limit the "suppressed Redis error" log itself - Bull's three
// connections per queue × four queues × N retries can produce dozens of
// identical lines in the first second. Log the first few, then stay
// quiet for the rest of the process lifetime so real errors stay visible.
let suppressedRedisLogCount = 0;
const SUPPRESS_LOG_BUDGET = 3;
const logSuppressedRedisError = (kind: string, err: unknown): void => {
  suppressedRedisLogCount += 1;
  if (suppressedRedisLogCount <= SUPPRESS_LOG_BUDGET) {
    // eslint-disable-next-line no-console
    console.warn(`[feastpot-api] suppressed ${kind}:`, (err as Error).message);
    if (suppressedRedisLogCount === SUPPRESS_LOG_BUDGET) {
      // eslint-disable-next-line no-console
      console.warn('[feastpot-api] (further benign Redis errors will be silently suppressed)');
    }
  }
};
process.on('uncaughtException', (err) => {
  if (isBenignRedisError(err)) {
    logSuppressedRedisError('uncaught Redis error', err);
    return;
  }
  // eslint-disable-next-line no-console
  console.error('[feastpot-api] uncaughtException', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  if (isBenignRedisError(reason)) {
    logSuppressedRedisError('unhandled Redis rejection', reason);
    return;
  }
  // Real unhandled rejections indicate a programming bug; continuing in
  // an undefined state can corrupt data or hide regressions. Re-throw so
  // Node's default handler exits the process, then the platform restarts
  // us cleanly. (Without this, Node 22 deprecates silent ignore anyway.)
  // eslint-disable-next-line no-console
  console.error('[feastpot-api] unhandledRejection', reason);
  throw reason;
});

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { assertRequiredEnvOrExit } from './common/config/required-env';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import {
  PrismaExceptionFilter,
  PrismaValidationFilter,
} from './common/filters/prisma-exception.filter';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';

const ALLOWED_ORIGINS = [
  'https://feastpot.co.uk',
  'https://www.feastpot.co.uk',
  'https://vendor.feastpot.co.uk',
  'https://admin.feastpot.co.uk',
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3003',
];

async function bootstrap(): Promise<void> {
  // D21: fail loudly at startup if a critical secret is missing.
  // In production we hard-exit (1); in dev we just log so contributors can
  // run a partial stack without every secret set.
  assertRequiredEnvOrExit();

  // rawBody: true + bodyParser: false → we install express.json with a verify
  // hook ourselves so req.rawBody is the EXACT bytes Stripe signed. If we let
  // Nest install its own parser, edge cases (charset, content-type quirks,
  // double-parse) have historically dropped rawBody and broken signature
  // verification - every webhook then 400s and orders never confirm.
  // bufferLogs: true so the early-bootstrap logs are buffered until pino
  // takes over below - otherwise they'd be dropped by Nest's default logger
  // before useLogger() swaps it out.
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  // Manual body parsers - must be installed BEFORE any route runs. The verify
  // callback stashes the raw Buffer on the request so Stripe's webhook
  // controller can call stripe.webhooks.constructEvent(req.rawBody, sig, secret).
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  const config = app.get(ConfigService);
  const env = config.get<string>('NODE_ENV') ?? 'development';
  const port = Number(config.get<string>('PORT') ?? process.env.PORT ?? 3001);

  // Stripe live/test mode guard. A test key running in production would
  // silently fail to move real money (and never error visibly); a live
  // key in a non-prod environment could charge real cards. Fail closed in
  // production, warn loudly in dev. The logger is already swapped to pino
  // above so these lines land in structured logs.
  const logger = app.get(Logger);
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
  if (env === 'production' && stripeKey.startsWith('sk_test_')) {
    logger.error(
      '[STARTUP] CRITICAL: STRIPE_SECRET_KEY is a test key in production. ' +
        'Update STRIPE_SECRET_KEY in Replit deployment secrets to the live key. ' +
        'Refusing to start.',
    );
    process.exit(1);
  }
  if (env !== 'production' && stripeKey.startsWith('sk_live_')) {
    logger.warn(
      '[STARTUP] WARNING: STRIPE_SECRET_KEY is a live key in a non-production ' +
        'environment. Real money could be charged. This is allowed but be careful.',
    );
  }
  const stripeMode = stripeKey.startsWith('sk_live_')
    ? 'LIVE'
    : stripeKey.startsWith('sk_test_')
      ? 'TEST'
      : 'MISSING/UNKNOWN';
  logger.log(`[Stripe] Mode: ${stripeMode}`);

  // Notification credentials check. Unlike the Stripe guard above, missing
  // notification creds are NON-fatal: a degraded platform (orders still flow,
  // comms get logged-only) beats no platform at all. But warn loudly so ops
  // knows vendors/customers aren't being alerted. We check the env vars the
  // providers actually read (EmailProvider → RESEND_API_KEY + EMAIL_FROM;
  // WhatsappProvider → Twilio OR Meta Cloud backend), not a fixed list, so the
  // warning can never disagree with what actually delivers.
  const emailConfigured = !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const whatsappConfigured =
    !!(
      process.env.TWILIO_WHATSAPP_FROM &&
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN
    ) || !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const missingChannels: string[] = [];
  if (!emailConfigured) {
    missingChannels.push('email (needs RESEND_API_KEY + EMAIL_FROM)');
  }
  if (!whatsappConfigured) {
    missingChannels.push(
      'whatsapp (needs TWILIO_WHATSAPP_FROM + TWILIO_ACCOUNT_SID/AUTH_TOKEN, or WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID)',
    );
  }
  if (missingChannels.length > 0) {
    logger.warn(
      `[STARTUP] Notification channels not configured: ${missingChannels.join('; ')}. ` +
        'Those channels will be logged-only (silently dropped) until set.',
    );
  }

  // Replit Autoscale (and most cloud platforms) front the container with a
  // reverse proxy. Trusting it lets Express read the real client IP from
  // X-Forwarded-For for rate-limit + audit purposes.
  const httpAdapter = app.getHttpAdapter().getInstance() as express.Express;
  httpAdapter.set('trust proxy', 1);

  app.use(helmet());
  app.use(compression());

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.enableCors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // `forbidNonWhitelisted` was previously `true`, which 400'd ANY request
      // carrying an unknown key - including harmless query-string passengers
      // like `?utm_source=google` / `?fbclid=…` from ad deep-links and
      // `?status=live` diagnostic curls before the DTO declared `status`.
      // We keep `whitelist: true` so unknown keys are STRIPPED before they
      // reach handlers (no Prisma `where`-spread escape route), but stop
      // throwing on their presence - matching what most production NestJS
      // APIs ship with.
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Nest REVERSES global filters during resolution and picks the first whose
  // @Catch() matches (a catch-all matches everything), so the LAST-registered
  // filter is checked FIRST. ThrottlerException extends HttpException, so the
  // dedicated ThrottlerExceptionFilter must be registered AFTER the catch-all
  // HttpExceptionFilter - otherwise the catch-all wins and the 429 never reaches
  // its own filter. Everything else still falls through to HttpExceptionFilter.
  app.useGlobalFilters(
    new PrismaExceptionFilter(),
    new PrismaValidationFilter(),
    new HttpExceptionFilter(),
    new ThrottlerExceptionFilter(),
  );

  if (env !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Feastpot API')
      .setDescription('UK diaspora bulk food marketplace API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Bind to 0.0.0.0 - required for Replit's container networking. Listening on
  // localhost only would make the service invisible to the platform's proxy.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.info(`[feastpot-api] listening on http://0.0.0.0:${port} (${env})`);
  // eslint-disable-next-line no-console
  console.log('Feastpot API running on port', port);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[feastpot-api] fatal bootstrap error', err);
  process.exit(1);
});
