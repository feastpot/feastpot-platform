// Sentry must be required before anything else so its OpenTelemetry
// auto-instrumentation can hook into Node's module loader.
import './instrument';
import 'reflect-metadata';

import compression from 'compression';
import express from 'express';
import helmet from 'helmet';

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
