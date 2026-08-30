import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  AiProvider,
  AiProviderError,
  AiProviderErrorCode,
  AiRetryPolicy,
  ChatCompletionOptions,
  DEFAULT_AI_RETRY_POLICY,
  ProviderChatResult,
} from '../interfaces/ai-provider.interface';
import { withRetry } from './retry';

/**
 * Anthropic Claude Messages provider.
 *
 * BA-079: the vendor response is normalized into {@link ProviderChatResult}
 * and malformed/empty payloads are surfaced as stable {@link AiProviderError}
 * domain errors instead of silently returning empty strings.
 *
 * BA-078: transient failures (429, 5xx, network) are retried with bounded
 * exponential backoff via {@link withRetry}; non-retryable errors propagate
 * with sanitized messages.
 */
@Injectable()
export class ClaudeProvider implements AiProvider {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private retryPolicy: AiRetryPolicy;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ANTHROPIC_API_KEY') || '';
    this.model = this.configService.get<string>('AI_MODEL') || 'claude-sonnet-4-20250514';
    this.maxTokens = this.configService.get<number>('AI_MAX_TOKENS') || 4096;
    this.temperature = this.configService.get<number>('AI_TEMPERATURE') || 0.7;
    this.retryPolicy = {
      maxAttempts:
        this.configService.get<number>('AI_RETRY_MAX_ATTEMPTS') ??
        DEFAULT_AI_RETRY_POLICY.maxAttempts,
      baseDelayMs:
        this.configService.get<number>('AI_RETRY_BASE_DELAY_MS') ??
        DEFAULT_AI_RETRY_POLICY.baseDelayMs,
      maxDelayMs:
        this.configService.get<number>('AI_RETRY_MAX_DELAY_MS') ??
        DEFAULT_AI_RETRY_POLICY.maxDelayMs,
    };
  }

  async generateChatCompletion(
    options: ChatCompletionOptions,
    retryPolicy?: AiRetryPolicy,
  ): Promise<ProviderChatResult> {
    if (!this.apiKey) {
      throw new AiProviderError(
        AiProviderErrorCode.MISSING_CREDENTIALS,
        'Claude provider selected but ANTHROPIC_API_KEY is not set',
        { retryable: false },
      );
    }

    const policy = retryPolicy ?? this.retryPolicy;
    const systemMsg = options.messages.find((m) => m.role === 'system');
    const otherMessages = options.messages.filter((m) => m.role !== 'system');

    const data = await withRetry(
      async () => {
        const { data } = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: this.model,
            max_tokens: options.maxTokens ?? this.maxTokens,
            temperature: options.temperature ?? this.temperature,
            system: systemMsg?.content,
            messages: otherMessages.map((m) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content,
            })),
          },
          {
            headers: {
              'x-api-key': this.apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
          },
        );
        return data;
      },
      policy,
      undefined,
      'Claude',
    );

    return this.normalizeResponse(data);
  }

  /**
   * Map the raw Anthropic payload to the shared result model (BA-079).
   *
   * @throws AiProviderError(MALFORMED_RESPONSE) when the payload shape is
   *         not the documented Messages schema.
   * @throws AiProviderError(EMPTY_RESPONSE) when the payload is well-formed
   *         but carries no usable completion text.
   */
  private normalizeResponse(data: unknown): ProviderChatResult {
    const body = data as {
      model?: string;
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    if (!Array.isArray(body?.content)) {
      throw new AiProviderError(
        AiProviderErrorCode.MALFORMED_RESPONSE,
        'Claude provider returned a malformed response (missing content array)',
        { retryable: false },
      );
    }

    const textBlock = body.content.find((block) => block?.type === 'text');

    if (!textBlock || typeof textBlock.text !== 'string') {
      throw new AiProviderError(
        AiProviderErrorCode.MALFORMED_RESPONSE,
        'Claude provider returned a malformed response (no text block)',
        { retryable: false },
      );
    }

    if (textBlock.text.trim().length === 0) {
      throw new AiProviderError(
        AiProviderErrorCode.EMPTY_RESPONSE,
        'Claude provider returned an empty completion',
        { retryable: false },
      );
    }

    return {
      content: textBlock.text,
      provider: 'claude',
      model: body.model,
      usage: body.usage
        ? {
            promptTokens: body.usage.input_tokens,
            completionTokens: body.usage.output_tokens,
            totalTokens: (body.usage.input_tokens ?? 0) + (body.usage.output_tokens ?? 0),
          }
        : undefined,
    };
  }
}
