import * as Joi from 'joi';

import {
  ENV_VALIDATION_OPTIONS,
  FORBIDDEN_PRODUCTION_SECRETS,
  MIN_PRODUCTION_SECRET_LENGTH,
  NON_PRODUCTION_DEFAULTS,
  SECRET_ENV_KEYS,
  assetEnvSchema,
  baseEnvSchema,
  contractEnvSchema,
  envValidationSchema,
  isFeatureEnabled,
  isFeatureExplicitlyDisabled,
  jobEnvSchema,
  migrationEnvSchema,
  notificationEnvSchema,
} from './env.schema';

/** Validate through the exact options `ConfigModule.forRoot()` uses. */
function validate(env: Record<string, unknown>): Joi.ValidationResult {
  return envValidationSchema.validate(env, ENV_VALIDATION_OPTIONS);
}

const PRODUCTION_SECRET = 'a'.repeat(MIN_PRODUCTION_SECRET_LENGTH + 8);
const PRODUCTION_SIGNING_SECRET = 'b'.repeat(MIN_PRODUCTION_SECRET_LENGTH + 8);

const validProductionEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:pw@db.internal:5432/rustacademy',
  REDIS_HOST: 'redis.internal',
  JWT_SECRET: PRODUCTION_SECRET,
  ASSET_SIGNING_SECRET: PRODUCTION_SIGNING_SECRET,
};

describe('env.schema', () => {
  describe('composition', () => {
    it('is a single schema that contains every area-specific key', () => {
      const keys = Object.keys(envValidationSchema.describe().keys ?? {});

      const areaSchemas = [
        baseEnvSchema,
        assetEnvSchema,
        contractEnvSchema,
        jobEnvSchema,
        migrationEnvSchema,
        notificationEnvSchema,
      ];

      for (const schema of areaSchemas) {
        for (const key of Object.keys(schema.describe().keys ?? {})) {
          expect(keys).toContain(key);
        }
      }
    });

    it('leaves unknown-variable handling to the shared validation options', () => {
      // Schema-level `.unknown()` / `.options()` used to fight with the
      // options object passed to forRoot. The schema must stay neutral.
      const described = envValidationSchema.describe() as {
        flags?: { unknown?: boolean };
        preferences?: Joi.ValidationOptions;
      };

      expect(described.flags?.unknown).toBeUndefined();
      expect(described.preferences).toBeUndefined();
      expect(ENV_VALIDATION_OPTIONS).toEqual({
        abortEarly: false,
        convert: true,
        allowUnknown: true,
        stripUnknown: false,
      });
    });
  });

  describe('development and test defaults', () => {
    it('boots with an empty environment and applies explicit defaults', () => {
      const { error, value } = validate({});

      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('development');
      expect(value.PORT).toBe(3000);
      expect(value.CORS_ORIGIN).toBe('*');
      expect(value.LOCALE).toBe('en');
      expect(value.REDIS_HOST).toBe('localhost');
      expect(value.REDIS_PORT).toBe(6379);
      expect(value.DATABASE_URL).toBe(
        NON_PRODUCTION_DEFAULTS.development.DATABASE_URL,
      );
      expect(value.JWT_SECRET).toBe(
        NON_PRODUCTION_DEFAULTS.development.JWT_SECRET,
      );
      expect(value.ASSET_SIGNING_SECRET).toBe(
        NON_PRODUCTION_DEFAULTS.development.ASSET_SIGNING_SECRET,
      );
    });

    it('applies the dedicated test defaults when NODE_ENV=test', () => {
      const { error, value } = validate({ NODE_ENV: 'test' });

      expect(error).toBeUndefined();
      expect(value.DATABASE_URL).toBe(NON_PRODUCTION_DEFAULTS.test.DATABASE_URL);
      expect(value.JWT_SECRET).toBe(NON_PRODUCTION_DEFAULTS.test.JWT_SECRET);
      expect(value.ASSET_SIGNING_SECRET).toBe(
        NON_PRODUCTION_DEFAULTS.test.ASSET_SIGNING_SECRET,
      );
    });

    it('keeps development and test defaults distinct from each other', () => {
      expect(NON_PRODUCTION_DEFAULTS.development.DATABASE_URL).not.toBe(
        NON_PRODUCTION_DEFAULTS.test.DATABASE_URL,
      );
      expect(NON_PRODUCTION_DEFAULTS.development.JWT_SECRET).not.toBe(
        NON_PRODUCTION_DEFAULTS.test.JWT_SECRET,
      );
    });

    it('applies asset quota defaults', () => {
      const { value } = validate({});

      expect(value.ASSETS_MAX_SIZE_MB).toBe(10);
      expect(value.ASSETS_MAX_TOTAL_MB).toBe(1024);
      expect(value.ASSETS_MAX_COUNT).toBe(10_000);
      expect(value.ASSETS_UPLOAD_DIR).toBe('./data/uploads');
    });

    it('applies contract, job, migration and notification defaults', () => {
      const { value } = validate({});

      expect(value.CONTRACT_INGESTION_ENABLED).toBe('false');
      expect(value.CONTRACT_ADAPTER_MODE).toBe('mock');
      expect(value.CONTRACT_EVENT_RETENTION_DAYS).toBe(90);
      expect(value.MAX_JOB_RETRIES).toBe(3);
      expect(value.MIGRATION_STRICT_ORDERING).toBe('true');
      expect(value.NOTIFICATION_DEFAULT_CHANNEL).toBe('all');
    });
  });

  describe('production requirements', () => {
    it('rejects a production boot that is missing secrets and persistence', () => {
      const { error } = validate({ NODE_ENV: 'production' });

      expect(error).toBeDefined();
      const message = error!.message;
      for (const key of [
        'DATABASE_URL',
        'REDIS_HOST',
        'JWT_SECRET',
        'ASSET_SIGNING_SECRET',
      ]) {
        expect(message).toContain(key);
      }
    });

    it('accepts a fully configured production environment', () => {
      const { error, value } = validate(validProductionEnv);

      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('production');
      expect(value.JWT_SECRET).toBe(PRODUCTION_SECRET);
    });

    it('does not fall back to development defaults in production', () => {
      const { error } = validate({
        ...validProductionEnv,
        DATABASE_URL: undefined,
      });

      expect(error).toBeDefined();
      expect(error!.message).toContain('DATABASE_URL');
    });

    it('rejects low-entropy production secrets', () => {
      const { error } = validate({
        ...validProductionEnv,
        JWT_SECRET: 'short-secret',
      });

      expect(error).toBeDefined();
      expect(error!.message).toContain(
        `at least ${MIN_PRODUCTION_SECRET_LENGTH} characters`,
      );
    });

    it.each(FORBIDDEN_PRODUCTION_SECRETS.map((secret) => [secret]))(
      'rejects the placeholder secret %s in production',
      (placeholder) => {
        const { error } = validate({
          ...validProductionEnv,
          JWT_SECRET: placeholder,
        });

        expect(error).toBeDefined();
        expect(error!.message).toContain('JWT_SECRET');
      },
    );

    it('rejects the non-production defaults being reused in production', () => {
      for (const defaults of Object.values(NON_PRODUCTION_DEFAULTS)) {
        const { error } = validate({
          ...validProductionEnv,
          JWT_SECRET: defaults.JWT_SECRET,
          ASSET_SIGNING_SECRET: defaults.ASSET_SIGNING_SECRET,
        });

        expect(error).toBeDefined();
        expect(error!.message).toContain('JWT_SECRET');
        expect(error!.message).toContain('ASSET_SIGNING_SECRET');
      }
    });

    it('rejects a database URL with an unsupported scheme', () => {
      const { error } = validate({
        ...validProductionEnv,
        DATABASE_URL: 'ftp://app:pw@db.internal/rustacademy',
      });

      expect(error).toBeDefined();
      expect(error!.message).toContain('DATABASE_URL');
    });

    it('requires the provider API key that the selected AI provider needs', () => {
      expect(validate({ AI_PROVIDER: 'claude' }).error?.message).toContain(
        'ANTHROPIC_API_KEY',
      );
      expect(validate({ AI_PROVIDER: 'openai' }).error?.message).toContain(
        'OPENAI_API_KEY',
      );
      expect(validate({ AI_PROVIDER: 'mock' }).error).toBeUndefined();
    });
  });

  describe('secret redaction', () => {
    const leakyValue = 'sup3r-s3cret-value-that-must-never-be-printed';

    it('never echoes a rejected secret value in the error message', () => {
      const { error } = validate({
        ...validProductionEnv,
        JWT_SECRET: leakyValue.slice(0, 20),
        ASSET_SIGNING_SECRET: leakyValue.slice(0, 12),
      });

      expect(error).toBeDefined();
      expect(error!.message).toContain('JWT_SECRET');
      expect(error!.message).not.toContain(leakyValue.slice(0, 12));
    });

    it('never echoes a malformed database URL, which carries credentials', () => {
      const dbUrl = `ftp://app:${leakyValue}@db.internal/rustacademy`;
      const { error } = validate({ ...validProductionEnv, DATABASE_URL: dbUrl });

      expect(error).toBeDefined();
      expect(error!.message).not.toContain(leakyValue);
      expect(error!.message).not.toContain(dbUrl);
    });

    it('keeps every secret key out of the rendered message', () => {
      const env: Record<string, unknown> = { NODE_ENV: 'production' };
      for (const key of SECRET_ENV_KEYS) {
        env[key] = leakyValue;
      }

      const { error } = validate(env);

      expect(error).toBeDefined();
      expect(error!.message).not.toContain(leakyValue);
    });
  });

  describe('unknown variables', () => {
    it('tolerates unrelated process variables by default', () => {
      const { error, value } = validate({
        PATH: '/usr/local/bin',
        HOME: '/home/node',
        CI: 'true',
        SOME_FUTURE_FLAG: 'yes',
      });

      expect(error).toBeUndefined();
      expect(value.SOME_FUTURE_FLAG).toBe('yes');
    });

    it('rejects unknown variables when strict mode is requested explicitly', () => {
      const { error } = envValidationSchema.validate(
        { UNKNOWN_VALUE: 'value' },
        { ...ENV_VALIDATION_OPTIONS, allowUnknown: false },
      );

      expect(error).toBeDefined();
      expect(error!.message).toContain('UNKNOWN_VALUE');
    });
  });

  describe('deterministic failures', () => {
    it('reports every invalid variable in a single pass', () => {
      const { error } = validate({
        NODE_ENV: 'staging',
        PORT: 'not-a-port',
        REDIS_PORT: -1,
        AI_TEMPERATURE: 9,
      });

      expect(error).toBeDefined();
      // NODE_ENV=staging is a valid value — it does not produce an error.
      // We expect at least 3 other failures to be reported together.
      expect(error!.details.length).toBeGreaterThanOrEqual(3);
      for (const key of ['PORT', 'REDIS_PORT', 'AI_TEMPERATURE']) {
        expect(error!.message).toContain(key);
      }
    });

    it('produces the same error for the same input every time', () => {
      const env = { NODE_ENV: 'production', PORT: 'nope' };

      const first = validate(env).error?.message;
      const second = validate(env).error?.message;

      expect(first).toBeDefined();
      expect(second).toBe(first);
    });

    it('coerces string env values into their declared types', () => {
      const { error, value } = validate({
        PORT: '8080',
        REDIS_PORT: '6380',
        AI_MAX_TOKENS: '2048',
        EXPORT_NOTIFICATION_ENABLED: 'false',
      });

      expect(error).toBeUndefined();
      expect(value.PORT).toBe(8080);
      expect(value.REDIS_PORT).toBe(6380);
      expect(value.AI_MAX_TOKENS).toBe(2048);
      expect(value.EXPORT_NOTIFICATION_ENABLED).toBe(false);
    });
  });

  describe('CORS_ORIGIN parsing', () => {
    it('keeps the wildcard as-is', () => {
      expect(validate({ CORS_ORIGIN: '*' }).value.CORS_ORIGIN).toBe('*');
    });

    it('returns a single origin as a plain string', () => {
      expect(
        validate({ CORS_ORIGIN: 'https://rustacademy.xyz' }).value.CORS_ORIGIN,
      ).toBe('https://rustacademy.xyz');
    });

    it('splits a comma-separated list into an array of origins', () => {
      expect(
        validate({
          CORS_ORIGIN: 'https://a.example, https://b.example ,',
        }).value.CORS_ORIGIN,
      ).toEqual(['https://a.example', 'https://b.example']);
    });

    it('rejects an origin list that resolves to nothing', () => {
      expect(validate({ CORS_ORIGIN: ' , , ' }).error).toBeDefined();
    });
  });

  describe('feature-flag helpers', () => {
    it('treats only the literal string "true" as enabled', () => {
      expect(isFeatureEnabled('true')).toBe(true);
      expect(isFeatureEnabled('false')).toBe(false);
      expect(isFeatureEnabled('TRUE')).toBe(false);
      expect(isFeatureEnabled(undefined)).toBe(false);
    });

    it('treats only the literal string "false" as explicitly disabled', () => {
      expect(isFeatureExplicitlyDisabled('false')).toBe(true);
      expect(isFeatureExplicitlyDisabled('true')).toBe(false);
      expect(isFeatureExplicitlyDisabled(undefined)).toBe(false);
    });
  });
});
