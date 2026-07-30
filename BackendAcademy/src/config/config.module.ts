import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

/**
 * Application config module with contract-specific environment
 * variable validation (#395, #396).
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validationSchema: contractEnvSchema.concat(
        Joi.object({
        // ── Base config ─────────────────────────────────────────────
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
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

        // Static / uploaded asset support
        ASSETS_UPLOAD_DIR: Joi.string().optional(),
        ASSETS_MAX_SIZE_MB: Joi.number().optional(),
        ASSETS_BASE_URL: Joi.string().optional(),
        ASSETS_STATIC_DIR: Joi.string().optional(),

        // Grading retry backoff configuration (Issue #360)
        GRADING_MAX_RETRIES: Joi.number().default(5),
        GRADING_RETRY_BASE_DELAY_MS: Joi.number().default(2000),
        GRADING_RETRY_MAX_DELAY_MS: Joi.number().default(120_000),

        // Leaderboard cache configuration (Issue #361)
        LEADERBOARD_CACHE_TTL_MS: Joi.number().default(30_000),
      }),
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
