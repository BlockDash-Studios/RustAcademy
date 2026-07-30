import { envSchema } from './env.schema';

describe('Environment schema validation', () => {
  const baseEnv = {
    NODE_ENV: 'development',
    PORT: 3000,
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
  };

  it('accepts a valid environment', () => {
    const { error, value } = envSchema.validate(baseEnv);

    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(3000);
  });

  it('applies defaults when optional values are omitted', () => {
    const env = { NODE_ENV: 'test' };
    const { error, value } = envSchema.validate(env);

    expect(error).toBeUndefined();
    expect(value.PORT).toBe(3000);
    expect(value.REDIS_HOST).toBe('localhost');
    expect(value.REDIS_PORT).toBe(6379);
  });

  it('rejects unknown environment variables', () => {
    const { error } = envSchema.validate(
      { ...baseEnv, UNKNOWN_VALUE: 'value' },
      { allowUnknown: false },
    );

    expect(error).toBeDefined();
    expect(error?.message).toContain('UNKNOWN_VALUE');
  });

  it('rejects invalid node environment values', () => {
    const { error } = envSchema.validate({ ...baseEnv, NODE_ENV: 'staging' });

    expect(error).toBeDefined();
    expect(error?.message).toContain('NODE_ENV');
  });

  it('rejects invalid redis port values', () => {
    const { error } = envSchema.validate({ ...baseEnv, REDIS_PORT: -1 });

    expect(error).toBeDefined();
    expect(error?.message).toContain('REDIS_PORT');
  });
});
