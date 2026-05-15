// Sentry must be required before anything else so its OpenTelemetry
// auto-instrumentation can hook into Node's module loader.
import './instrument';
import 'reflect-metadata';

import compression from 'compression';
import express from 'express';
import helmet from 'helmet';

// Bull v3 spins up three ioredis connections per queue (client, subscriber,
// bclient). When REDIS_URL has bad credentials, AUTH fails on all three —
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
  // Redis-protocol auth errors are unambiguous — they only come from a
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
  return false;
};
// Rate-limit the "suppressed Redis error" log itself — Bull's three
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
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

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
  // rawBody: true preserves the raw request body so the Stripe webhook controller
  // can verify signatures with stripe.webhooks.constructEvent().
  // bufferLogs: true so the early-bootstrap logs are buffered until pino
  // takes over below — otherwise they'd be dropped by Nest's default logger
  // before useLogger() swaps it out.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  const config = app.get(ConfigService);
  const env = config.get<string>('NODE_ENV') ?? 'development';
  const port = Number(config.get<string>('PORT') ?? process.env.PORT ?? 3001);

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
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

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

  // Bind to 0.0.0.0 — required for Replit's container networking. Listening on
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
