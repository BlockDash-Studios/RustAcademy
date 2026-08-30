export interface AiProviderConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatCompletionMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Normalized result contract returned by every AI provider (BA-079).
 *
 * Providers convert their vendor-specific response shapes into this single
 * internal model, so callers never depend on OpenAI vs Anthropic details.
 */
export interface ProviderChatResult {
  /** The generated assistant reply text. */
  content: string;
  /** Identifier of the provider that produced the result ('openai' | 'claude'). */
  provider: string;
  /** Model identifier that served the request, when reported by the vendor. */
  model?: string;
  /** Token usage reported by the vendor, when available. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Stable, machine-readable error codes for provider failures (BA-079).
 *
 * These codes are part of the internal contract: callers can branch on them
 * and the values never embed raw vendor payloads.
 */
export enum AiProviderErrorCode {
  /** The provider was selected but its API key is missing/empty. */
  MISSING_CREDENTIALS = 'MISSING_CREDENTIALS',
  /** The provider returned a response that does not match its schema. */
  MALFORMED_RESPONSE = 'MALFORMED_RESPONSE',
  /** The provider returned a well-formed response with no usable content. */
  EMPTY_RESPONSE = 'EMPTY_RESPONSE',
  /** The provider is rate limiting the account (HTTP 429). */
  RATE_LIMITED = 'RATE_LIMITED',
  /** The provider returned a 5xx or the upstream was unreachable. */
  UPSTREAM_ERROR = 'UPSTREAM_ERROR',
  /** The request exceeded the configured timeout. */
  TIMEOUT = 'TIMEOUT',
}

/**
 * Domain error raised by AI providers and the AI service (BA-079, BA-078).
 *
 * The message is always sanitized: it never contains raw response bodies,
 * API keys, or other credentials, so it is safe to surface in logs and
 * error responses.
 */
export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  /** HTTP status observed from the vendor, when applicable. */
  readonly status?: number;
  /**
   * Whether a retry could succeed. Transient failures (429, 5xx, network)
   * return `true`; schema/credential failures return `false`.
   */
  readonly retryable: boolean;
  /** Number of retry attempts already consumed for this error, if any. */
  readonly attempts?: number;

  constructor(
    code: AiProviderErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean; attempts?: number } = {},
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
    this.status = options.status;
    this.retryable =
      options.retryable ??
      (code === AiProviderErrorCode.RATE_LIMITED ||
        code === AiProviderErrorCode.UPSTREAM_ERROR);
    this.attempts = options.attempts;
  }
}

/**
 * Retry policy for transient provider failures (BA-078).
 *
 * Only retryable failures (429, 5xx, network errors) are retried; attempts
 * and inter-attempt delay are strictly bounded so a flaky vendor can never
 * cause unbounded request amplification.
 */
export interface AiRetryPolicy {
  /** Maximum number of retry attempts after the initial call (default 3). */
  maxAttempts: number;
  /** Base delay in ms before the first retry (default 250). */
  baseDelayMs: number;
  /** Upper bound in ms for the exponential backoff (default 5000). */
  maxDelayMs: number;
}

export const DEFAULT_AI_RETRY_POLICY: AiRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 5_000,
};

export interface AiProvider {
  /**
   * Generate a chat completion.
   *
   * Implementations MUST return the normalized {@link ProviderChatResult}
   * and MUST throw {@link AiProviderError} for every failure mode, including
   * malformed/empty vendor responses.
   */
  generateChatCompletion(
    options: ChatCompletionOptions,
    retryPolicy?: AiRetryPolicy,
  ): Promise<ProviderChatResult>;
}
