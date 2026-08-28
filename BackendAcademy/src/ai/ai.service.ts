import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateChatRequestDto } from './dto/create-chat-request.dto';
import { GetHintDto } from './dto/get-hint.dto';
import { PreScoreDto } from './dto/pre-score.dto';
import { VoiceInteractionDto } from './dto/voice-interaction.dto';
import { TtsRequestDto } from './dto/tts-request.dto';
import {
  AiChatResponse,
  AiChatRecord,
  AiHintResponse,
  AiRecommendationResponse,
  ChatMessage,
  Hint,
  HintUsageAnalytics,
  HintUsageRecord,
  VoiceInteractionResponse,
  TtsResponse,
} from './interfaces/ai.interface';
import { PreScoreResult } from './interfaces/pre-score.interface';
import { AiProvider, ProviderChatResult } from './interfaces/ai-provider.interface';
import { PromptTemplateService } from './prompt-template.service';
import { v4 as uuidv4 } from 'uuid';
import { AnalyticsService } from '../analytics/analytics.service';
import { RedisService } from '../redis/redis.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { SecurityService } from '../security/security.service';

export const AI_PROVIDER = 'AI_PROVIDER';

const MAX_CHAT_HISTORY_PER_USER = 200; // bound in-memory growth per user
const MAX_TRACKED_USERS = 5_000; // bound total map size across users
const MAX_PRE_SCORE_CODE_LENGTH = 20_000; // guard against oversized submissions

/// BA-081: Redis key prefix for durable hint usage records.
const HINT_USAGE_KEY_PREFIX = 'hint:usage:';
/// BA-081: Redis key prefix for the per-hint user set (for unique-user counts).
const HINT_USERS_KEY_PREFIX = 'hint:users:';
/// BA-081: Hint usage must survive restarts for calibration analytics; keep
/// records for 90 days instead of relying on the cache default TTL.
const HINT_USAGE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  private chatHistory: Map<string, ChatMessage[]> = new Map();
  private chatRecords: Map<string, AiChatRecord> = new Map();
  private hints: Map<string, Hint[]> = new Map();
  /** BA-081: Durable hint usage records keyed by `userId:hintId`. */
  private hintUsage: Map<string, HintUsageRecord> = new Map();
  private readonly defaultTimeoutMs: number;
  private readonly maxChatHistoryLength: number;

  constructor(
    @Optional() @Inject(AI_PROVIDER) private aiProvider?: AiProvider,
    private configService?: ConfigService,
    private readonly analyticsService?: AnalyticsService,
    private readonly redisService?: RedisService,
    private readonly monitoringService?: MonitoringService,
    @Optional() private readonly promptTemplateService?: PromptTemplateService,
    @Optional() private readonly securityService?: SecurityService,
  ) {
    this.defaultTimeoutMs = this.configService?.get<number>('DEFAULT_REQUEST_TIMEOUT_MS') ?? 30_000;
    this.maxChatHistoryLength = this.configService?.get<number>('AI_MAX_CHAT_HISTORY_LENGTH') ?? 50;
    this.initializeSampleHints();

    // Surface missing optional dependencies loudly instead of failing silently.
    if (!this.redisService) this.logger.warn('RedisService not injected — chat/recommendation state is process-local and non-durable.');
    if (!this.analyticsService) this.logger.warn('AnalyticsService not injected — pre-score events will not be tracked.');
    if (!this.monitoringService) this.logger.warn('MonitoringService not injected — domain events will not be recorded.');
    if (!this.aiProvider) this.logger.warn('AiProvider not injected — chat requests will use the static fallback response.');
  }

  async getRecommendation(userId: string): Promise<AiRecommendationResponse> {
    const snapshot = this.redisService
      ? await this.redisService.getUserSnapshot(userId)
      : null;

    if (!snapshot) {
      return {
        userId,
        recommendations: [],
        explainability: {
          factors: ['insufficient_data'],
          confidence: 0.1,
          userSignalAge: 0,
          signalsUsed: [],
          modelVersion: 'rustacademy-recommender-v2',
        },
        generatedAt: new Date(),
      };
    }

    const explainability = this.redisService
      ? await this.redisService.getRecommendationExplainability(userId)
      : null;

    const recommendedCourses = snapshot.recentCourses.length > 0
      ? snapshot.recentCourses.slice(0, 3)
      : ['rust-fundamentals', 'smart-contracts-101', 'stellar-basics'];

    const recommendations = recommendedCourses.map((courseId, index) => ({
      courseId,
      score: Math.max(0, 1 - index * 0.2 - (snapshot.interactionCount > 0 ? 0 : 0.3)),
      reason: explainability?.factors[index] || 'course_popularity',
    }));

    if (this.monitoringService) {
      this.monitoringService.recordDomainEvent('recommendation_generated', 'ai');
    }

    return {
      userId,
      recommendations,
      explainability: explainability || {
        factors: [],
        confidence: 0.1,
        userSignalAge: 0,
        signalsUsed: [],
        modelVersion: 'rustacademy-recommender-v2',
      },
      generatedAt: new Date(),
    };
  }

  async processChatRequest(
    createChatRequestDto: CreateChatRequestDto,
  ): Promise<AiChatResponse> {
    const { message, userId, context } = createChatRequestDto;

    // Issue #371: sanitise user-supplied prompts before they reach the AI
    // provider. When SecurityService is wired in, prompts containing known
    // prompt-injection patterns are either wrapped in a hard system-pinned
    // boundary or rejected outright. Without SecurityService we degrade
    // gracefully (the previous behaviour) so unit tests keep working.
    const sanitisation = this.securityService
      ? this.securityService.sanitisePrompt(message)
      : null;

    const effectiveMessage = sanitisation?.sanitised ?? message;

    const response =
      sanitisation?.status === 'rejected'
        ? sanitisation.sanitised
        : await this.generateChatResponse(effectiveMessage);

    const chatMessage: ChatMessage = {
      id: uuidv4(),
      userId,
      message,
      response,
      timestamp: new Date(),
      context,
      isComplete: true,
    };

    this.appendChatHistory(userId, chatMessage);

    // Fix: chatRecords was previously never populated, so getChatRecord()/
    // listChatRecords() always returned nothing. Record one entry per
    // processed message here, keyed by the message id as its sessionId.
    this.chatRecords.set(chatMessage.id, {
      id: chatMessage.id,
      sessionId: chatMessage.id,
      userId,
      messages: [chatMessage],
      startedAt: chatMessage.timestamp,
      lastActivityAt: chatMessage.timestamp,
    });

    // #372: Auto-summarise when history exceeds threshold
    await this.autoSummarize(userId);

    // Track prompt template usage in metrics (#374)
    if (this.monitoringService) {
      this.monitoringService.recordDomainEvent('ai_prompt_template_used', 'ai');
    }

    if (this.redisService) {
      await this.redisService.refreshUserSnapshot(userId, {
        lastInteractionAt: new Date(),
        interactionCount: 1,
        eventTypes: ['chat_message'],
      });
    }

    return {
      response: chatMessage.response,
      timestamp: chatMessage.timestamp,
      messageId: chatMessage.id,
      // Surface the sanitisation outcome so callers can audit unsafe inputs.
      ...(sanitisation && sanitisation.status !== 'safe'
        ? {
            safety: {
              status: sanitisation.status,
              reasons: sanitisation.reasons,
              originalLength: sanitisation.originalLength,
            },
          }
        : {}),
    };
  }

  /**
   * Calls the AI provider with the global request timeout (Issue #408) and
   * falls back to a static response if the provider is unavailable, times
   * out, or errors — so a flaky upstream never surfaces as a 500 to callers.
   *
   * The user message is sent together with the versioned chat system prompt
   * from configuration (#374). BA-079: the provider returns the normalized
   * {@link ProviderChatResult} model, so only `.content` is consumed here.
   */
  private async generateChatResponse(message: string): Promise<string> {
    if (!this.aiProvider) {
      return this.fallbackResponse(message);
    }

    const systemPrompt = this.promptTemplateService
      ? this.promptTemplateService.getSystemPrompt('chat_tutor', {
          version: this.configService?.get<string>('AI_PROMPT_TEMPLATE_VERSION'),
        })
      : 'You are a helpful Rust programming tutor.';

    try {
      const result: ProviderChatResult = await this.withTimeout(
        this.aiProvider.generateChatCompletion({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
        }),
        this.defaultTimeoutMs,
      );
      return result.content;
    } catch (err) {
      this.logger.error('AI provider call failed, falling back to static response', err as Error);
      if (this.monitoringService) {
        this.monitoringService.recordDomainEvent('ai_provider_failure', 'ai');
      }
      return this.fallbackResponse(message);
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`AI provider call timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  async getHint(getHintDto: GetHintDto): Promise<AiHintResponse> {
    const { challengeId, difficulty = 1, userId } = getHintDto;

    const challengeHints = this.hints.get(challengeId) || [];

    const hint =
      challengeHints.find((h) => h.difficulty === difficulty) ||
      challengeHints[0];

    if (!hint) {
      return {
        hint: 'No hints available for this challenge yet. Keep trying!',
        hintId: uuidv4(),
        difficulty: 1,
      };
    }

    hint.usedCount++;

    // BA-081: Persist user-scoped hint usage so counts are durable and can
    // support difficulty calibration across instances. Falls back to a
    // process-local map when RedisService isn't injected.
    await this.recordHintUsage(userId, challengeId, hint);

    return {
      hint: hint.hint,
      hintId: hint.id,
      difficulty: hint.difficulty,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // BA-081: Hint usage analytics
  // ──────────────────────────────────────────────────────────────────

  /**
   * Persist a hint request, deduplicated per `userId:hintId`.
   *
   * The in-memory map is the source of truth when no RedisService is
   * injected (unit tests). When it is, every record is mirrored to Redis
   * under `hint:usage:{userId}:{hintId}` and every hint keeps a set of the
   * users who used it (`hint:users:{hintId}`) so unique-user counts survive
   * restarts and are correct across instances.
   */
  private async recordHintUsage(
    userId: string,
    challengeId: string,
    hint: Hint,
  ): Promise<void> {
    const recordKey = `${userId}:${hint.id}`;
    const existing = this.hintUsage.get(recordKey);
    const now = new Date();

    const record: HintUsageRecord = existing
      ? { ...existing, usedCount: existing.usedCount + 1, lastUsedAt: now }
      : {
          hintId: hint.id,
          challengeId,
          difficulty: hint.difficulty,
          userId,
          usedCount: 1,
          firstUsedAt: now,
          lastUsedAt: now,
        };
    this.hintUsage.set(recordKey, record);

    if (this.redisService) {
      await Promise.all([
        this.redisService.set(
          `${HINT_USAGE_KEY_PREFIX}${recordKey}`,
          record,
          HINT_USAGE_TTL_MS,
        ),
        this.redisService.sadd(`${HINT_USERS_KEY_PREFIX}${hint.id}`, userId),
      ]);
    }
  }

  /**
   * BA-081: Aggregate hint usage for analytics. Combines the process-local
   * map with any records persisted in Redis so results are correct even
   * after a restart or across replicas.
   */
  async getHintUsageAnalytics(): Promise<HintUsageAnalytics> {
    const records = await this.collectHintUsageRecords();

    const usesByHint: Record<string, number> = {};
    const usesByDifficulty: Record<number, number> = {};
    const uniqueUserIds = new Set<string>();
    let totalUses = 0;

    for (const record of records) {
      usesByHint[record.hintId] = (usesByHint[record.hintId] ?? 0) + record.usedCount;
      usesByDifficulty[record.difficulty] =
        (usesByDifficulty[record.difficulty] ?? 0) + record.usedCount;
      uniqueUserIds.add(record.userId);
      totalUses += record.usedCount;
    }

    return {
      totalUses,
      uniqueUsers: uniqueUserIds.size,
      records,
      usesByHint,
      usesByDifficulty,
    };
  }

  /**
   * BA-081: Fetch every persisted hint usage record, merging the local map
   * with Redis state (Redis wins on key collision since it may contain data
   * from another instance).
   */
  private async collectHintUsageRecords(): Promise<HintUsageRecord[]> {
    const merged = new Map<string, HintUsageRecord>(this.hintUsage);

    if (this.redisService) {
      const persistedKeys = await this.redisService.getKeys(
        `${HINT_USAGE_KEY_PREFIX}*`,
      );
      for (const key of persistedKeys) {
        const stored = (await this.redisService.get(key)) as
          | HintUsageRecord
          | null
          | undefined;
        if (stored && stored.hintId) {
          merged.set(key.replace(HINT_USAGE_KEY_PREFIX, ''), stored);
        }
      }
    }

    return Array.from(merged.values()).sort(
      (a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime(),
    );
  }

  async preScore(dto: PreScoreDto): Promise<PreScoreResult> {
    const { taskId, code } = dto;

    if (code.length > MAX_PRE_SCORE_CODE_LENGTH) {
      throw new Error(
        `Submission exceeds maximum length of ${MAX_PRE_SCORE_CODE_LENGTH} characters`,
      );
    }

    const lines = code.split('\n').filter((l) => l.trim().length > 0).length;
    const hasComments = code.includes('//') || code.includes('/*');
    const hasFunctions = code.includes('fn ');
    const hasMain = code.includes('fn main');

    let score = 50;
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const suggestions: string[] = [];

    if (hasMain) {
      score += 15;
      strengths.push('Includes a main function entry point');
    } else {
      weaknesses.push('No main function found');
      suggestions.push('Add a fn main() entry point to your program');
    }

    if (hasFunctions && lines > 5) {
      score += 15;
      strengths.push('Code is organized into functions');
    } else if (lines <= 5) {
      weaknesses.push('Very short submission - may be incomplete');
      suggestions.push('Expand your solution with proper implementation');
    }

    if (hasComments) {
      score += 10;
      strengths.push('Code includes helpful comments');
    } else {
      suggestions.push('Consider adding comments to explain your logic');
    }

    if (lines > 20) {
      score += 10;
      strengths.push('Comprehensive implementation');
    }

    score = Math.min(100, Math.max(0, score));

    if (this.analyticsService) {
      await this.analyticsService.trackEvent({
        id: uuidv4(),
        eventType: 'submission_prescore',
        properties: { taskId, score, lines },
      });
    }

    return {
      taskId,
      predictedScore: score,
      confidence: 0.7,
      feedback:
        score >= 70
          ? 'Your submission looks promising. Keep refining!'
          : 'Your submission needs improvement. Review the suggestions below.',
      strengths,
      weaknesses,
      suggestions,
      evaluatedAt: new Date(),
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Chat history management (#372, #373)
  // ──────────────────────────────────────────────────────────────────

  async getChatHistory(userId: string): Promise<ChatMessage[]> {
    return this.chatHistory.get(userId) || [];
  }

  /**
   * #373: Marks a message as incomplete when a chat streaming disconnect
   * leaves a partial response in state. Incomplete messages can be cleaned
   * up or shown to the user with a warning.
   */
  markMessageIncomplete(userId: string, messageId: string): boolean {
    const history = this.chatHistory.get(userId);
    if (!history) return false;

    const msg = history.find((m) => m.id === messageId);
    if (!msg) return false;

    msg.isComplete = false;

    if (this.monitoringService) {
      this.monitoringService.recordDomainEvent('chat_streaming_disconnect', 'ai');
    }

    this.logger.warn(
      `Message ${messageId} for user ${userId} marked incomplete due to streaming disconnect`,
    );
    return true;
  }

  /**
   * #373: Removes all incomplete messages from a user's chat history,
   * preventing partial responses from persisting in conversation state.
   */
  cleanupIncompleteMessages(userId: string): number {
    const history = this.chatHistory.get(userId);
    if (!history) return 0;

    const incompleteCount = history.filter((m) => !m.isComplete).length;
    const cleaned = history.filter((m) => m.isComplete);
    this.chatHistory.set(userId, cleaned);

    if (incompleteCount > 0) {
      this.logger.log(
        `Cleaned up ${incompleteCount} incomplete messages for user ${userId}`,
      );
      if (this.monitoringService) {
        this.monitoringService.recordDomainEvent('chat_incomplete_messages_cleaned', 'ai');
      }
    }
    return incompleteCount;
  }

  /**
   * #372: Automatically generates a conversation summary when chat history
   * exceeds the configured maxChatHistoryLength. Older messages are compacted
   * into a summary string to keep token usage under control during long
   * tutoring sessions.
   */
  private async autoSummarize(userId: string): Promise<void> {
    const history = this.chatHistory.get(userId);
    if (!history || history.length <= this.maxChatHistoryLength) return;

    const excess = history.length - this.maxChatHistoryLength;
    const olderMessages = history.slice(0, excess);
    const recentMessages = history.slice(excess);

    // Build a compact summary from older messages
    const topicSummary = this.buildConversationSummary(olderMessages);

    // Store the summary on the most relevant chat record or create one
    const existingRecord = Array.from(this.chatRecords.values()).find(
      (r) => r.userId === userId,
    );

    const summaryText = `[Conversation summary — ${new Date().toISOString()}]: ${topicSummary}`;

    if (existingRecord) {
      existingRecord.summary = existingRecord.summary
        ? `${existingRecord.summary}\n${summaryText}`
        : summaryText;
      existingRecord.lastSummaryAt = new Date();
    } else {
      const newRecord: AiChatRecord = {
        id: uuidv4(),
        userId,
        sessionId: `session-${Date.now()}`,
        messages: recentMessages,
        startedAt: olderMessages[0]?.timestamp ?? new Date(),
        lastActivityAt: new Date(),
        summary: summaryText,
        lastSummaryAt: new Date(),
      };
      this.chatRecords.set(newRecord.id, newRecord);
    }

    // Keep only the most recent messages in active history
    this.chatHistory.set(userId, recentMessages);

    if (this.monitoringService) {
      this.monitoringService.recordDomainEvent('chat_summary_generated', 'ai');
    }

    this.logger.log(
      `Auto-summarised ${excess} messages for user ${userId} (${recentMessages.length} retained)`,
    );
  }

  /**
   * #372: Builds a compact conversation summary from a list of chat messages.
   * Extracts key topics and user questions without storing the full text.
   */
  private buildConversationSummary(messages: ChatMessage[]): string {
    if (messages.length === 0) return 'No prior conversation.';

    const userMessages = messages
      .filter((m) => m.message && m.message.trim().length > 0)
      .map((m) => m.message.slice(0, 120));

    if (userMessages.length === 0) return `${messages.length} interactions.`;

    const topics = userMessages.slice(0, 10).join('; ');
    const topicPreview =
      topics.length > 500 ? topics.slice(0, 500) + '...' : topics;

    return `${messages.length} messages covering: ${topicPreview}`;
  }

  /**
   * #372: Returns the current conversation summary for a user, if one exists.
   */
  getConversationSummary(userId: string): string | null {
    const record = Array.from(this.chatRecords.values()).find(
      (r) => r.userId === userId,
    );
    return record?.summary ?? null;
  }

  getChatRecord(sessionId: string): AiChatRecord | null {
    return this.chatRecords.get(sessionId) ?? null;
  }

  listChatRecords(userId: string): AiChatRecord[] {
    return Array.from(this.chatRecords.values()).filter((r) => r.userId === userId);
  }

  async processVoice(dto: VoiceInteractionDto) {
    const transcription = `[Transcribed: ${dto.audioData.slice(0, 50)}...]`;
    const response: VoiceInteractionResponse = {
      transcription,
      confidence: 0.85,
      processedAt: new Date(),
    };
    return response;
  }

  async generateTts(dto: TtsRequestDto) {
    const response: TtsResponse = {
      audioData: Buffer.from(dto.text).toString('base64'),
      format: 'audio/wav',
      durationMs: dto.text.length * 60,
    };
    return response;
  }

  private fallbackResponse(userMessage: string): string {
    const responses = [
      "That's a great question! Let me help you work through that. Based on what you've shared, I think the first thing you should understand is the core concept behind the problem.",
      "Good thinking! You're on the right track. To move forward, I'd recommend reviewing the documentation on this topic and trying to implement a small piece first.",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private initializeSampleHints() {
    const sampleHints: Hint[] = [
      {
        id: uuidv4(),
        challengeId: 'sample-challenge-001',
        hint: 'Start by understanding the problem requirements thoroughly.',
        difficulty: 1,
        usedCount: 0,
      },
      {
        id: uuidv4(),
        challengeId: 'sample-challenge-001',
        hint: 'Consider edge cases - empty, null, or out-of-range inputs.',
        difficulty: 2,
        usedCount: 0,
      },
      {
        id: uuidv4(),
        challengeId: 'sample-challenge-001',
        hint: 'Implement brute-force first, then optimize.',
        difficulty: 3,
        usedCount: 0,
      },
    ];

    this.hints.set('sample-challenge-001', sampleHints);
  }

  /**
   * Bounded append: caps per-user history length and total tracked users
   * so this in-memory map can't grow without limit in a long-lived process.
   * This is a stopgap — durable, cross-instance history should move to
   * Redis/Postgres via `redisService`, since chat state currently doesn't
   * survive a restart or work across multiple API replicas.
   */
  private appendChatHistory(userId: string, chatMessage: ChatMessage) {
    if (!this.chatHistory.has(userId)) {
      if (this.chatHistory.size >= MAX_TRACKED_USERS) {
        const oldestKey = this.chatHistory.keys().next().value;
        if (oldestKey !== undefined) this.chatHistory.delete(oldestKey);
      }
      this.chatHistory.set(userId, []);
    }

    const history = this.chatHistory.get(userId)!;
    history.push(chatMessage);
    if (history.length > MAX_CHAT_HISTORY_PER_USER) {
      history.splice(0, history.length - MAX_CHAT_HISTORY_PER_USER);
    }
  }
}
