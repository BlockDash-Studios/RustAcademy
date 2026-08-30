import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { OpenaiProvider } from './openai.provider';
import { ClaudeProvider } from './claude.provider';
import {
  AiProviderError,
  AiProviderErrorCode,
  ProviderChatResult,
} from '../interfaces/ai-provider.interface';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function configService(values: Record<string, unknown>): ConfigService {
  return { get: <T = unknown>(key: string): T | undefined => values[key] as T } as ConfigService;
}

/** Retry policy with zero delay so tests stay fast. */
const FAST_POLICY = { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 };

const OPENAI_CFG = configService({
  OPENAI_API_KEY: 'sk-test-openai',
  AI_MODEL: 'gpt-4o',
  AI_MAX_TOKENS: 100,
  AI_TEMPERATURE: 0.5,
});

const CLAUDE_CFG = configService({
  ANTHROPIC_API_KEY: 'sk-ant-test-claude',
  AI_MODEL: 'claude-sonnet-4-20250514',
  AI_MAX_TOKENS: 100,
  AI_TEMPERATURE: 0.5,
});

describe('AI providers — BA-079 response normalization & BA-078 retry', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('OpenaiProvider', () => {
    it('normalizes a valid response into the shared result model', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          model: 'gpt-4o',
          choices: [{ message: { content: 'Ownership is key.' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      });

      const provider = new OpenaiProvider(OPENAI_CFG);
      const result: ProviderChatResult = await provider.generateChatCompletion({
        messages: [{ role: 'user', content: 'Explain ownership' }],
      });

      expect(result).toEqual({
        content: 'Ownership is key.',
        provider: 'openai',
        model: 'gpt-4o',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
    });

    it('throws a stable MALFORMED_RESPONSE error when choices is missing', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { model: 'gpt-4o' } });
      const provider = new OpenaiProvider(OPENAI_CFG);

      await expect(
        provider.generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toMatchObject({
        name: 'AiProviderError',
        code: AiProviderErrorCode.MALFORMED_RESPONSE,
        retryable: false,
      });
    });

    it('throws EMPTY_RESPONSE when choices is an empty array', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { choices: [] } });
      const provider = new OpenaiProvider(OPENAI_CFG);

      await expect(
        provider.generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toMatchObject({ code: AiProviderErrorCode.EMPTY_RESPONSE });
    });

    it('throws MALFORMED_RESPONSE when message content is missing', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { choices: [{ message: {} }] },
      });
      const provider = new OpenaiProvider(OPENAI_CFG);

      await expect(
        provider.generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toMatchObject({ code: AiProviderErrorCode.MALFORMED_RESPONSE });
    });

    it('throws EMPTY_RESPONSE when content is an empty string', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { choices: [{ message: { content: '   ' } }] },
      });
      const provider = new OpenaiProvider(OPENAI_CFG);

      await expect(
        provider.generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toMatchObject({ code: AiProviderErrorCode.EMPTY_RESPONSE });
    });

    it('throws MISSING_CREDENTIALS without calling the API when the key is unset', async () => {
      const provider = new OpenaiProvider(configService({ OPENAI_API_KEY: '' }));

      await expect(
        provider.generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toMatchObject({
        code: AiProviderErrorCode.MISSING_CREDENTIALS,
        retryable: false,
      });
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('retries a 429 response and succeeds on the next attempt', async () => {
      mockedAxios.post
        .mockRejectedValueOnce({ response: { status: 429, data: {} } })
        .mockResolvedValueOnce({
          data: { choices: [{ message: { content: 'recovered' } }] },
        });

      const provider = new OpenaiProvider(OPENAI_CFG);
      const result = await provider.generateChatCompletion(
        { messages: [{ role: 'user', content: 'hi' }] },
        FAST_POLICY,
      );

      expect(result.content).toBe('recovered');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('gives up after bounded attempts and surfaces RATE_LIMITED', async () => {
      mockedAxios.post.mockRejectedValue({ response: { status: 429, data: {} } });

      const provider = new OpenaiProvider(OPENAI_CFG);
      const error = await provider
        .generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }, FAST_POLICY)
        .catch((e) => e);

      expect(error).toBeInstanceOf(AiProviderError);
      expect(error.code).toBe(AiProviderErrorCode.RATE_LIMITED);
      expect(error.retryable).toBe(true);
      expect(error.attempts).toBe(2);
      // 1 initial attempt + 2 retries
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('does not retry non-retryable 4xx errors', async () => {
      mockedAxios.post.mockRejectedValue({ response: { status: 400, data: {} } });

      const provider = new OpenaiProvider(OPENAI_CFG);
      const error = await provider
        .generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }, FAST_POLICY)
        .catch((e) => e);

      expect(error).toBeInstanceOf(AiProviderError);
      expect(error.retryable).toBe(false);
      expect(error.status).toBe(400);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('retries network-level failures (no response)', async () => {
      mockedAxios.post
        .mockRejectedValueOnce({ request: {}, message: 'ECONNRESET' })
        .mockResolvedValueOnce({
          data: { choices: [{ message: { content: 'back online' } }] },
        });

      const provider = new OpenaiProvider(OPENAI_CFG);
      const result = await provider.generateChatCompletion(
        { messages: [{ role: 'user', content: 'hi' }] },
        FAST_POLICY,
      );

      expect(result.content).toBe('back online');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('ClaudeProvider', () => {
    it('normalizes a valid response into the shared result model', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          model: 'claude-sonnet-4-20250514',
          content: [{ type: 'text', text: 'Borrowing rules…' }],
          usage: { input_tokens: 8, output_tokens: 4 },
        },
      });

      const provider = new ClaudeProvider(CLAUDE_CFG);
      const result: ProviderChatResult = await provider.generateChatCompletion({
        messages: [{ role: 'user', content: 'Explain borrowing' }],
      });

      expect(result).toEqual({
        content: 'Borrowing rules…',
        provider: 'claude',
        model: 'claude-sonnet-4-20250514',
        usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 },
      });
    });

    it('throws MALFORMED_RESPONSE when content array is missing', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { model: 'claude' } });
      const provider = new ClaudeProvider(CLAUDE_CFG);

      await expect(
        provider.generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toMatchObject({ code: AiProviderErrorCode.MALFORMED_RESPONSE });
    });

    it('throws MALFORMED_RESPONSE when no text block exists', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { content: [{ type: 'tool_use', text: '' }] },
      });
      const provider = new ClaudeProvider(CLAUDE_CFG);

      await expect(
        provider.generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toMatchObject({ code: AiProviderErrorCode.MALFORMED_RESPONSE });
    });

    it('throws EMPTY_RESPONSE when the text block is empty', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { content: [{ type: 'text', text: ' ' }] },
      });
      const provider = new ClaudeProvider(CLAUDE_CFG);

      await expect(
        provider.generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toMatchObject({ code: AiProviderErrorCode.EMPTY_RESPONSE });
    });

    it('throws MISSING_CREDENTIALS without calling the API when the key is unset', async () => {
      const provider = new ClaudeProvider(configService({ ANTHROPIC_API_KEY: '' }));

      await expect(
        provider.generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toMatchObject({ code: AiProviderErrorCode.MISSING_CREDENTIALS });
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('retries a 503 and succeeds on the next attempt', async () => {
      mockedAxios.post
        .mockRejectedValueOnce({ response: { status: 503, data: {} } })
        .mockResolvedValueOnce({
          data: { content: [{ type: 'text', text: 'degraded but ok' }] },
        });

      const provider = new ClaudeProvider(CLAUDE_CFG);
      const result = await provider.generateChatCompletion(
        { messages: [{ role: 'user', content: 'hi' }] },
        FAST_POLICY,
      );

      expect(result.content).toBe('degraded but ok');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('sanitizes provider error messages (no payload details)', async () => {
      mockedAxios.post.mockRejectedValue({
        response: { status: 500, data: { error: { message: 'sk-secret-token-leak' } } },
      });

      const provider = new ClaudeProvider(CLAUDE_CFG);
      const error = await provider
        .generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }, FAST_POLICY)
        .catch((e) => e);

      expect(error.message).not.toContain('sk-secret-token-leak');
      expect(error.message).toContain('Claude');
      expect(error.message).toContain('500');
    });
  });
});
