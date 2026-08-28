import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiProvider, AiProviderError, AiProviderErrorCode } from './interfaces/ai-provider.interface';

function configService(values: Record<string, unknown>): ConfigService {
  return { get: <T = unknown>(key: string): T | undefined => values[key] as T } as ConfigService;
}

describe('AiService', () => {
  const fallbackMessages = [
    "That's a great question! Let me help you work through that. Based on what you've shared, I think the first thing you should understand is the core concept behind the problem.",
    "Good thinking! You're on the right track. To move forward, I'd recommend reviewing the documentation on this topic and trying to implement a small piece first.",
  ];

  describe('processChatRequest', () => {
    it('uses the normalized provider result content (BA-079)', async () => {
      const provider: AiProvider = {
        generateChatCompletion: jest.fn(async () => ({
          content: 'Normalized provider answer',
          provider: 'openai',
          model: 'gpt-4o',
        })),
      };

      const service = new AiService(
        provider,
        configService({ AI_PROMPT_TEMPLATE_VERSION: '1.0.0' }),
      );
      const result = await service.processChatRequest({
        message: 'What is ownership?',
        userId: 'user-1',
      });

      expect(result.response).toBe('Normalized provider answer');
      expect(provider.generateChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('falls back to a static response when the provider throws a domain error', async () => {
      const provider: AiProvider = {
        generateChatCompletion: jest.fn(async () => {
          throw new AiProviderError(
            AiProviderErrorCode.UPSTREAM_ERROR,
            'OpenAI provider returned an upstream error (HTTP 500)',
            { status: 500, retryable: true },
          );
        }),
      };

      const service = new AiService(provider, configService({}));
      const result = await service.processChatRequest({
        message: 'Explain traits',
        userId: 'user-2',
      });

      expect(fallbackMessages).toContain(result.response);
    });

    it('falls back when no provider is configured', async () => {
      const service = new AiService(undefined, configService({}));
      const result = await service.processChatRequest({
        message: 'Explain lifetimes',
        userId: 'user-3',
      });

      expect(fallbackMessages).toContain(result.response);
    });

    it('stores chat history and chat records per user', async () => {
      const provider: AiProvider = {
        generateChatCompletion: jest.fn(async () => ({
          content: 'answer',
          provider: 'openai',
        })),
      };

      const service = new AiService(provider, configService({}));
      await service.processChatRequest({ message: 'hi', userId: 'user-4' });

      expect(await service.getChatHistory('user-4')).toHaveLength(1);
      expect(service.listChatRecords('user-4')).toHaveLength(1);
    });
  });

  describe('getHint', () => {
    it('returns the built-in sample hint for the sample challenge', async () => {
      const service = new AiService(undefined, configService({}));
      const hint = await service.getHint({ userId: 'user-1', challengeId: 'sample-challenge-001', difficulty: 1 });
      expect(hint.hint).toBe('Start by understanding the problem requirements thoroughly.');
    });

    it('returns a fallback message for unknown challenges', async () => {
      const service = new AiService(undefined, configService({}));
      const hint = await service.getHint({ userId: 'user-1', challengeId: 'nope', difficulty: 1 });
      expect(hint.hint).toContain('No hints available');
    });

    it('records user-scoped, deduplicated hint usage (BA-081)', async () => {
      const service = new AiService(undefined, configService({}));

      await service.getHint({ userId: 'user-1', challengeId: 'sample-challenge-001', difficulty: 1 });
      await service.getHint({ userId: 'user-1', challengeId: 'sample-challenge-001', difficulty: 1 });
      await service.getHint({ userId: 'user-2', challengeId: 'sample-challenge-001', difficulty: 1 });
      await service.getHint({ userId: 'user-2', challengeId: 'sample-challenge-001', difficulty: 2 });

      const analytics = await service.getHintUsageAnalytics();

      // Same user requesting the same hint twice is one deduplicated record.
      expect(analytics.uniqueUsers).toBe(2);
      expect(analytics.totalUses).toBe(4);
      expect(analytics.records).toHaveLength(3);

      const firstHint = analytics.records.find(
        (r) => r.userId === 'user-1' && r.difficulty === 1,
      );
      expect(firstHint?.usedCount).toBe(2);

      // Difficulty distribution is captured for calibration.
      expect(analytics.usesByDifficulty[1]).toBe(3);
      expect(analytics.usesByDifficulty[2]).toBe(1);
    });

    it('survives a restart by persisting through RedisService (BA-081)', async () => {
      const redis = new (require('../redis/redis.service').RedisService)();
      const service = new AiService(undefined, configService({}), undefined, redis);

      await service.getHint({ userId: 'user-1', challengeId: 'sample-challenge-001', difficulty: 1 });

      // A fresh service instance (simulating a restart) reads from Redis.
      const restarted = new AiService(undefined, configService({}), undefined, redis);
      const analytics = await restarted.getHintUsageAnalytics();

      expect(analytics.totalUses).toBe(1);
      expect(analytics.uniqueUsers).toBe(1);
      expect(analytics.records[0].userId).toBe('user-1');
    });
  });

  describe('preScore', () => {
    it('scores a complete solution higher than a stub', async () => {
      const service = new AiService(undefined, configService({}));
      const good = await service.preScore({
        userId: 'user-1',
        taskId: 't1',
        code: '// main entry point\nfn main() {\n    let value = compute();\n    println!("{}", value);\n}\n\nfn compute() -> i32 {\n    42\n}',
      });
      const stub = await service.preScore({
        userId: 'user-1',
        taskId: 't2',
        code: '// TODO',
      });

      expect(good.predictedScore).toBeGreaterThan(stub.predictedScore);
    });

    it('rejects oversized submissions', async () => {
      const service = new AiService(undefined, configService({}));
      await expect(
        service.preScore({ userId: 'user-1', taskId: 't3', code: '// '.repeat(20_001) }),
      ).rejects.toThrow(/exceeds maximum length/);
    });
  });
});
