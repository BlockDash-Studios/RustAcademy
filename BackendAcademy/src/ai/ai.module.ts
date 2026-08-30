import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService, AI_PROVIDER } from './ai.service';
import { PromptTemplateService } from './prompt-template.service';
import { ClaudeProvider } from './providers/claude.provider';
import { OpenaiProvider } from './providers/openai.provider';

/**
 * BA-076: Validate the AI configuration at startup, before any request
 * arrives.
 *
 * Rules:
 * - `AI_PROVIDER=openai` requires `OPENAI_API_KEY`.
 * - `AI_PROVIDER=claude` requires `ANTHROPIC_API_KEY`.
 * - `AI_PROVIDER=mock` (or unset) requires no credentials.
 *
 * Error messages are actionable and sanitized: they name the missing
 * variable and the fix, but never echo credential values.
 */
export function validateAiConfig(configService: ConfigService): void {
  const provider = configService.get<string>('AI_PROVIDER') ?? 'mock';

  if (provider === 'openai' || provider === 'claude') {
    const credentialsKey =
      provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    const apiKey = configService.get<string>(credentialsKey);
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error(
        `AI_PROVIDER is "${provider}" but ${credentialsKey} is not set. ` +
          `Set ${credentialsKey} to your API key, or switch AI_PROVIDER to "mock" for local development.`,
      );
    }
  }

  const numericParams: Array<{ key: string; min: number; max: number; integer?: boolean }> = [
    { key: 'AI_TEMPERATURE', min: 0, max: 2 },
    { key: 'AI_TOP_P', min: 0, max: 1 },
    { key: 'AI_MAX_TOKENS', min: 1, max: 200000, integer: true },
    { key: 'AI_FREQUENCY_PENALTY', min: -2, max: 2 },
    { key: 'AI_PRESENCE_PENALTY', min: -2, max: 2 },
  ];

  for (const param of numericParams) {
    const raw = configService.get<string>(param.key);
    if (raw === undefined || raw === null || raw === '') continue;
    const num = Number(raw);
    if (Number.isNaN(num)) {
      throw new Error(`AI config ${param.key} must be a number, got "${raw}".`);
    }
    if (param.integer && !Number.isInteger(num)) {
      throw new Error(`AI config ${param.key} must be an integer, got "${raw}".`);
    }
    if (num < param.min || num > param.max) {
      throw new Error(`AI config ${param.key} must be between ${param.min} and ${param.max}, got "${raw}".`);
    }
    process.env[param.key] = String(num);
  }

  const boolParams = ['AI_ENABLE_STREAMING', 'AI_ENABLE_LOGGING'];
  for (const key of boolParams) {
    const raw = configService.get<string>(key);
    if (raw === undefined || raw === null || raw === '') continue;
    const lower = raw.toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(lower)) {
      process.env[key] = 'true';
    } else if (['false', '0', 'no', 'n', 'off'].includes(lower)) {
      process.env[key] = 'false';
    } else {
      throw new Error(`AI config ${key} must be a boolean, got "${raw}".`);
    }
  }
}

const aiProviderFactory = {
  provide: AI_PROVIDER,
  useFactory: (configService: ConfigService) => {
    validateAiConfig(configService);
    const provider = configService.get<string>('AI_PROVIDER');
    if (provider === 'openai') return new OpenaiProvider(configService);
    if (provider === 'claude') return new ClaudeProvider(configService);
    return null;
  },
  inject: [ConfigService],
};

@Module({
  controllers: [AiController],
  providers: [AiService, PromptTemplateService, aiProviderFactory],
  exports: [AiService, PromptTemplateService],
})
export class AiModule {}
