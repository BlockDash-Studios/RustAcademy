import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
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
      }),
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
