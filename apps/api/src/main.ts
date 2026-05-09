import 'reflect-metadata';

import compression from 'compression';
import helmet from 'helmet';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

const ALLOWED_ORIGINS = [
  'https://feastpot.co.uk',
  'https://vendor.feastpot.co.uk',
  'https://admin.feastpot.co.uk',
  'http://localhost:3000',
];

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const env = config.get<string>('NODE_ENV') ?? 'development';
  const port = Number(config.get<string>('PORT') ?? process.env.PORT ?? 3001);

  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
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

  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.info(`[feastpot-api] listening on http://0.0.0.0:${port} (${env})`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[feastpot-api] fatal bootstrap error', err);
  process.exit(1);
});
