import { Injectable, Module } from '@nestjs/common';

/**
 * `AiModule` — Anthropic Claude API client wrapper (BE-066).
 *
 * Per the root README's package layout (`ai-client/ — Claude API wrapper`),
 * this is the single place the rest of the backend talks to Claude: the
 * mentor chat, grader, and code-review endpoints (BE-067/068/070) should
 * all depend on `CLAUDE_CLIENT` rather than calling the Anthropic API
 * directly, so provider swaps and mocking stay centralized here.
 */

/** The three roles the AI Mentor feature area uses Claude for. */
export type ClaudeRole = 'mentor' | 'grader' | 'reviewer';

export interface ClaudeCompletionRequest {
  role: ClaudeRole;
  /** System prompt appropriate for the role (mentor/grader/reviewer). */
  system: string;
  /** The user-supplied prompt/content (question, submission, pasted code). */
  prompt: string;
  maxTokens?: number;
}

export interface ClaudeCompletionResult {
  text: string;
  /** Total tokens billed for this request, when the API reports it. */
  tokensUsed?: number;
}

/** Injection token so callers (and tests) can swap in a mock provider. */
export const CLAUDE_CLIENT = 'CLAUDE_CLIENT';

export interface ClaudeClient {
  complete(request: ClaudeCompletionRequest): Promise<ClaudeCompletionResult>;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Thin wrapper around the Anthropic Messages API. Uses the global `fetch`
 * (Node 18+) directly rather than the `@anthropic-ai/sdk` package, so this
 * client has no new dependency to install.
 */
@Injectable()
export class AnthropicClaudeClient implements ClaudeClient {
  private readonly apiKey: string | undefined = process.env.ANTHROPIC_API_KEY;

  async complete(request: ClaudeCompletionRequest): Promise<ClaudeCompletionResult> {
    if (!this.apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set — the Claude client cannot make requests without it.',
      );
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Claude API request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
    const tokensUsed =
      data.usage?.input_tokens !== undefined && data.usage?.output_tokens !== undefined
        ? data.usage.input_tokens + data.usage.output_tokens
        : undefined;

    return { text, tokensUsed };
  }
}

@Module({
  providers: [{ provide: CLAUDE_CLIENT, useClass: AnthropicClaudeClient }],
  exports: [CLAUDE_CLIENT],
})
export class AiModule {}
