import { ConfigService } from '@nestjs/config';
import { validateAiConfig } from './ai.module';

function configService(values: Record<string, unknown>): ConfigService {
  return { get: <T = unknown>(key: string): T | undefined => values[key] as T } as ConfigService;
}

describe('validateAiConfig — BA-076 startup credential validation', () => {
  it('accepts mock mode without any API keys', () => {
    expect(() =>
      validateAiConfig(configService({ AI_PROVIDER: 'mock' })),
    ).not.toThrow();
  });

  it('accepts an unset AI_PROVIDER (defaults to mock)', () => {
    expect(() => validateAiConfig(configService({}))).not.toThrow();
  });

  it('accepts openai when OPENAI_API_KEY is set', () => {
    expect(() =>
      validateAiConfig(
        configService({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' }),
      ),
    ).not.toThrow();
  });

  it('accepts claude when ANTHROPIC_API_KEY is set', () => {
    expect(() =>
      validateAiConfig(
        configService({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'sk-ant-test' }),
      ),
    ).not.toThrow();
  });

  it('rejects openai without OPENAI_API_KEY with an actionable message', () => {
    expect(() => validateAiConfig(configService({ AI_PROVIDER: 'openai' }))).toThrow(
      /AI_PROVIDER is "openai" but OPENAI_API_KEY is not set/,
    );
  });

  it('rejects claude without ANTHROPIC_API_KEY with an actionable message', () => {
    expect(() => validateAiConfig(configService({ AI_PROVIDER: 'claude' }))).toThrow(
      /AI_PROVIDER is "claude" but ANTHROPIC_API_KEY is not set/,
    );
  });

  it('rejects an empty (whitespace) key value', () => {
    expect(() =>
      validateAiConfig(configService({ AI_PROVIDER: 'openai', OPENAI_API_KEY: '   ' })),
    ).toThrow(/OPENAI_API_KEY is not set/);
  });

  it('does not leak credential values in error messages', () => {
    let message = '';
    try {
      validateAiConfig(configService({ AI_PROVIDER: 'claude' }));
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toContain('sk-ant');
    expect(message).toContain('ANTHROPIC_API_KEY');
  });
});
