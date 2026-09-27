import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

// Application entry point: creates the Nest app, applies global
// middleware/pipes, optionally sets up Swagger docs, and starts
// listening on the configured port.
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Sets a range of security-related HTTP headers (CSP, X-Frame-Options,
  // etc.) on every response.
  app.use(helmet());
  // Allows cross-origin requests. Note: called with no options here, so
  // this applies permissive default CORS settings rather than the
  // fine-grained config (allowed origins/methods/headers) defined in
  // the app's own "cors" config — that config isn't wired in here.
  app.enableCors();
  // Prefixes every route with /api, except routes under "health" (so
  // liveness/readiness/status checks remain reachable at their bare
  // paths for monitoring tools that expect them un-prefixed).
  app.setGlobalPrefix('api', { exclude: ['health'] });

  // Global validation pipe applied to all incoming request bodies/params:
  //  - whitelist: strips properties not defined on the target DTO
  //  - transform: converts payloads into instances of their DTO classes
  //  - forbidNonWhitelisted: rejects requests containing any property
  //    not defined on the DTO (rather than silently dropping them)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const configService = app.get(ConfigService);
  // Swagger docs default to enabled unless explicitly turned off via
  // the SWAGGER_ENABLED env var.
  const swaggerEnabled = configService.get<string>('SWAGGER_ENABLED', 'true') === 'true';
  if (swaggerEnabled) {
    // Builds the OpenAPI document metadata (title/description/version)
    // and enables Bearer token auth in the generated docs UI.
    const config = new DocumentBuilder()
      .setTitle('RustAcademy BackendAcademy API')
      .setDescription('NestJS backend API for RustAcademy — learn Rust, earn XLM, build Web3.')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    // Serves the interactive Swagger UI at /api/docs.
    SwaggerModule.setup('api/docs', app, document);
  }

  // Reads the port from config (defaulting to 4001) and starts the server.
  const port = Number(configService.get<string>('PORT', '4001'));
  await app.listen(port);
  logger.log(`BackendAcademy API listening on http://localhost:${port}/api`);
}

bootstrap();