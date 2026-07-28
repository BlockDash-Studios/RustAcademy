import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';

/**
 * Single source of truth for request-payload validation.
 *
 * Every deployment mode (local, container, e2e tests) must use these exact
 * options so that malformed payloads — including nested DTOs and arrays —
 * are rejected identically across all controllers.
 *
 * - `whitelist` / `forbidNonWhitelisted`: unknown top-level properties are
 *   rejected with 400 instead of being silently stripped or persisted.
 * - `forbidUnknownValues`: objects that carry no validation metadata are
 *   rejected. This surfaces DTOs that forgot their class-validator
 *   decorators instead of letting them silently accept anything.
 * - `transform`: incoming plain objects are converted to DTO instances so
 *   `@Type(() => …)` / `@ValidateNested()` run on nested payloads.
 * - `enableImplicitConversion: false`: coercion must be explicit via
 *   `@Type(() => Number)` etc., so query-string parsing behaves the same
 *   as JSON body parsing.
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
};

/** Builds the app-wide validation pipe. Used by `main.ts` and e2e tests. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe(VALIDATION_PIPE_OPTIONS);
}
