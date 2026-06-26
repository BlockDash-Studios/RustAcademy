import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';

async function bootstrap() {
  const app = NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Enable CORS
  (await app).enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // Global validation pipe
  (await app).useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT || 3000;
  await (await app).listen(port);
  logger.log(`Backend running on http://localhost:${port}`);
}
bootstrap();
