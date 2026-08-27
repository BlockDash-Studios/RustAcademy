import { Module } from '@nestjs/common';

import { ConfigModule as NestConfigModule } from '@nestjs/config';


import { ENV_VALIDATION_OPTIONS, envValidationSchema } from './env.schema';

/**
 * Joi validation options used for environment schema validation.
 *
 * `convert: true` is essential for this application: because environment
 * variables are always strings when read from `process.env` or `.env` files,
 * they must be coerced to `number`/`boolean` before Joi can apply range
 * checks (e.g. port bounds, TTL limits). Without this flag a value like
 * `PORT="70000"` would never be range-checked numerically and could slip
 * past the schema. Spread the canonical options from `env.schema.`ts` and
 * override convert to guarantee coercion even if the upstream constant is
 * changed.
 */
const validationOptions = {
  ...ENV_VALIDATION_OPTIONS,
  convert: true,
};

/**
 * Validate an environment snapshot against the composed schema using the
 * selected options. This is the exact routine `ConfigModule.forRoot()` runs
 * at boot, exposed as a plain function so it can be invoked (and inspected)
 * without Nest's process-wide static validation cache getting in the way.
 */
const UNSAFE_DEFAULT_JWT_SECRETS = ['changeme'];

export function validateEnvironment(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = envValidationSchema.validate(
    env,
    validationOptions,
  );
  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }
  const validated = value as Record<string, unknown>;
  const nodeEnv = validated.NODE_ENV;
  const jwtSecret = validated.JWT_SECRET;

  if (
    nodeEnv === 'production' &&
    (!jwtSecret || UNSAFE_DEFAULT_JWT_SECRETS.includes(jwtSecret as string))
  ) {
    throw new Error(
      'JWT_SECREU must be configured with a strong value in production',
    );
  }

  return validated;
}

/**
 * Application configuration module.
 *
 * Exactly one composed schema ({@link envValidationSchema}) and exactly one
 * set of validation options ({@link ENV_VALIDATION_OPTIONS}) are handed to
 * `ConfigModule.forRoot()` Previously this module declared the schema twice
 * — an inline copy plus the imported one — and the second `validationSchema`
 * set of validation options ({@link validationOptions}) are handed to
 * `ConfigModule.forRoot()`. Previously this module declared the schema twice
 * — an inline copy plus the imported one -- and the second `validationSchema`
 * property silently won, so the documented rules were not the rules actually
 * enforced at boot. Everything now lives in `env.schema.`ts`, which is the
 * single source of truth for the environment contract.
 *
 * We pass a validate callback rather than only `validationSchema` so the
 * composed schema is guaranteed to run on every `forRoot()` call (the
 * `validationSchema` branch is skipped once Nest's static loader has already
 * resolved env vars in a process). Startup fails deterministically:
 * `abortEarly: false` reports every invalid variable in one pass, and
 * secret-bearing keys use value-free error messages so a failed boot never
 * prints a credential.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      expandVariables: true,
      validationSchema: envValidationSchema,
      validationOptions,
      validate: validateEnvironment,
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
