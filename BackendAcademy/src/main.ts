import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { createValidationPipe } from './common/validation.pipe';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as envConfig from './config/env.schema';

const validationSchema = (envConfig as any).validationSchema ?? (envConfig as any).default;

if (!validationSchema || typeof validationSchema.validate !== 'function') {
  throw new Error('Missing or invalid environment validation schema in src/config/env.schema.ts');
}

function validateEnv(): Record<string, unknown> {
  const { error, value } = validationSchema.validate(process.env, {
    abortEarly: false,
    allowUnknown: true,
    convert: true,
  });
  if (error) {
    const details = error.details.map(detail => detail.message).join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }
  return value as Record<string, unknown>;
}

async function bootstrap() {
  const validatedEnv = validateEnv();
  for (const [key, val] of Object.entries(validatedEnv)) {
    process.env[key] = String(val);
  }

  // #662: `rawBody: true` keeps the unparsed request bytes available on
  // `req.rawBody` so webhook signatures can be verified against exactly what
  // the provider sent, before any JSON parsing/normalization happens.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const logger = new Logger('Bootstrap');

  const config = app.get(ConfigService);

  // Security: refuse to start in production with a missing or known default
  // JWT secret (e.g. the auth module's fallback 'changeme'). The error must
  // not disclose the secret itself.
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  if (nodeEnv === 'production') {
    const jwtSecret = config.get<string>('JWT_SECRET');
    if (!jwtSecret || jwtSecret === 'changeme') {
      throw new Error(
        'JWT_SECRET must be set to a secure value when NODE_ENV=production.',
      );
    }
  }

  // Graceful shutdown support
  app.enableShutdownHooks();

  // Override the internal config with the already-coerced environment values.
  for (const [key, val] of Object.entries(validatedEnv)) {
    config.set(key, val);
  }

  app.use(helmet());

  const corsOrigin = config.get<string | string[]>('CORS_ORIGIN', '*');
  const isWildcard = corsOrigin === '*';

  // Guard: refuse to start in production/staging with a wildcard CORS origin.
  // A wildcard combined with credentials:true lets any attacker site read
  // authenticated API responses — browsers would normally block it, but it is
  // safer to fail-fast at startup so a misconfigured deployment is obvious.
  if (nodeEnv === 'production' || nodeEnv === 'staging') {
    if (isWildcard) {
      throw new Error(
        'CORS_ORIGIN must not be "*" in production or staging. ' +
        'Set it to a comma-separated allow-list of explicit origins.',
      );
    }
  }

  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // credentials:true allows cookies/Authorization headers to be sent cross-origin.
    // It MUST NOT be combined with origin:'*' — browsers block such responses
    // and it would be a security vulnerability anyway. Only enable it when an
    // explicit allow-list is in use.
    credentials: !isWildcard,
  });

  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'api/v',
    defaultVersion: '1',
  });

  // Shared options (src/common/validation.pipe.ts) guarantee nested DSos
  // and arrays are validated — and malformed payloads rejected — the same
  // way in every controller.
  app.useGlobalPipes(createValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RustAcademy API')
    .setDescription('The RustAcademy Backend API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const staticDir = path.resolve(
    config.get<string>('ASSETS_STATIC_DIR', './public'),
  );
  try {
    fs.mkdirSync(staticDir, { recursive: true });
    app.useStaticAssets(staticDir, { prefix: '/static/' });
    logger.log(`Static assets served from ${staticDir} at /static/`);
  } catch (err) {
    logger.warn(`Failed to mount static asset directory ${staticDir}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  logger.log(`Backend running on http://localhost:${port}`);
}
bootstrap();