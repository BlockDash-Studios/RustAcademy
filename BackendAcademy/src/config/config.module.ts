import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validationSchema } from './env.schema';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        CORS_ORIGIN: Joi.string().optional(),
        DATABASE_URL: Joi.string().optional(),
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        JWT_SECRET: Joi.string().optional(),
        AI_PROVIDER: Joi.string().valid('claude', 'openai', 'mock').default('mock'),
        ANTHROPIC_API_KEY: Joi.string().optional(),
        OPENAI_API_KEY: Joi.string().optional(),
        AI_MODEL: Joi.string().optional(),
        AI_MAX_TOKENS: Joi.number().default(4096),
        AI_TEMPERATURE: Joi.number().default(0.7),
        LOCALE: Joi.string().default('en'),
        CRON_CLEANUP_SCHEDULE: Joi.string().default('0 0 * * *'),
        CRON_ANALYTICS_SCHEDULE: Joi.string().default('0 */6 * * *'),
        CRON_NOTIFICATIONS_SCHEDULE: Joi.string().default('*/30 * * * *'),

        DEFAULT_REQUEST_TIMEOUT_MS: Joi.number().default(30000),
        WEBHOOK_MAX_RETRIES: Joi.number().default(5),
        WEBHOOK_BASE_BACKOFF_MS: Joi.number().default(1000),
        WEBHOOK_MAX_BACKOFF_MS: Joi.number().default(60000),
        WEBHOOK_SIGNATURE_SECRET: Joi.string().optional(),
        WEBHOOK_IDEMPOTENCY_TTL_SECONDS: Joi.number().default(3600),
      }),
      cache: true,
      // Same lookup order everywhere; missing files are ignored, so
      // container deployments that inject env directly are unaffected.
      envFilePath: ['.env.local', '.env'],
      expandVariables: true,
      validationSchema,
      validationOptions: {
        // Report every invalid variable at once and coerce string env
        // values to their declared types (numbers, booleans, lists, JSON).
        abortEarly: false,
        allowUnknown: true,
        convert: true,
      },
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}