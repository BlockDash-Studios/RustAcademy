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
 * OpenAI chat-completions provider.
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
export class OpenaiProvider implements AiProvider {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private retryPolicy: AiRetryPolicy;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.model = this.configService.get<string>('AI_MODEL') || 'gpt-4o';
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
        'OpenAI provider selected but OPENAI_API_KEY is not set',
        { retryable: false },
      );
    }

    const policy = retryPolicy ?? this.retryPolicy;

    const data = await withRetry(
      async () => {
        const { data } = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: this.model,
            max_tokens: options.maxTokens ?? this.maxTokens,
            temperature: options.temperature ?? this.temperature,
            messages: options.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'content-type': 'application/json',
            },
          },
        );
        return data;
      },
      policy,
      undefined,
      'OpenAI',
    );

    return this.normalizeResponse(data);
  }

  /**
   * Map the raw OpenAI payload to the shared result model (BA-079).
   *
   * @throws AiProviderError(MALFORMED_RESPONSE) when the payload shape is
   *         not the documented chat-completions schema.
   * @throws AiProviderError(EMPTY_RESPONSE) when the payload is well-formed
   *         but carries no usable completion text.
   */
  private normalizeResponse(data: unknown): ProviderChatResult {
    const body = data as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    if (!Array.isArray(body?.choices)) {
      throw new AiProviderError(
        AiProviderErrorCode.MALFORMED_RESPONSE,
        'OpenAI provider returned a malformed response (missing choices array)',
        { retryable: false },
      );
    }

    if (body.choices.length === 0) {
      throw new AiProviderError(
        AiProviderErrorCode.EMPTY_RESPONSE,
        'OpenAI provider returned no choices',
        { retryable: false },
      );
    }

    const content = body.choices[0]?.message?.content;

    if (typeof content !== 'string') {
      throw new AiProviderError(
        AiProviderErrorCode.MALFORMED_RESPONSE,
        'OpenAI provider returned a malformed response (missing message content)',
        { retryable: false },
      );
    }

    if (content.trim().length === 0) {
      throw new AiProviderError(
        AiProviderErrorCode.EMPTY_RESPONSE,
        'OpenAI provider returned an empty completion',
        { retryable: false },
      );
    }

    return {
      content,
      provider: 'openai',
      model: body.model,
      usage: body.usage
        ? {
            promptTokens: body.usage.prompt_tokens,
            completionTokens: body.usage.completion_tokens,
            totalTokens: body.usage.total_tokens,
          }
        : undefined,
    };
  }
}
