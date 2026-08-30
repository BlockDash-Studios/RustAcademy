export interface ChatMessage {
  id: string;
  userId: string;
  message: string;
  response: string;
  timestamp: Date;
  context?: Record<string, any>;
  /** Indicates whether the chat response was fully delivered (#373) */
  isComplete: boolean;
}

export interface Hint {
  id: string;
  challengeId: string;
  hint: string;
  difficulty: number;
  usedCount: number;
}

export interface AiChatResponse {
  response: string;
  timestamp: Date;
  messageId: string;
  /**
   * Issue #371 — prompt sanitisation outcome. Present only when the
   * SecurityService flagged the user input. Omitted for clean inputs to
   * keep the common path zero-cost.
   */
  safety?: {
    status: 'wrapped' | 'rejected';
    reasons: string[];
    originalLength: number;
  };
}

export interface AiHintResponse {
  hint: string;
  hintId: string;
  difficulty: number;
}

/**
 * BA-081: Durable, user-scoped record of a hint request.
 *
 * Keyed by `userId:hintId`, so a user requesting the same hint twice is
 * tracked as a single record with an incremented `usedCount` rather than two
 * separate rows. This is what lets analytics answer "how often is this hint
 * used, by how many distinct users, and at what difficulty" without counting
 * the same learner repeatedly.
 */
export interface HintUsageRecord {
  hintId: string;
  challengeId: string;
  difficulty: number;
  userId: string;
  /** Number of times this user requested this hint. */
  usedCount: number;
  firstUsedAt: Date;
  lastUsedAt: Date;
}

/**
 * BA-081: Aggregated hint usage, queryable for calibration analytics.
 */
export interface HintUsageAnalytics {
  totalUses: number;
  uniqueUsers: number;
  /** One entry per `userId:hintId`, deduplicated per user. */
  records: HintUsageRecord[];
  /** `hintId -> total uses across all users`. */
  usesByHint: Record<string, number>;
  /** `difficulty -> total uses across all users`. */
  usesByDifficulty: Record<number, number>;
}

export interface AiChatRecord {
  id: string;
  userId: string;
  sessionId: string;
  messages: ChatMessage[];
  startedAt: Date;
  lastActivityAt: Date;
  metadata?: Record<string, unknown>;
  /** Compact summary of conversation for long tutoring sessions (#372) */
  summary?: string;
  /** Timestamp of the last summary generation (#372) */
  lastSummaryAt?: Date;
}

export interface VoiceInteractionResponse {
  transcription: string;
  confidence: number;
  processedAt: Date;
}

export interface TtsResponse {
  audioData: string;
  format: string;
  durationMs: number;
}

export interface RecommendationItem {
  courseId: string;
  score: number;
  reason: string;
}

export interface ExplainabilityMetadata {
  factors: string[];
  confidence: number;
  userSignalAge: number;
  signalsUsed: string[];
  modelVersion: string;
}

export interface AiRecommendationResponse {
  userId: string;
  recommendations: RecommendationItem[];
  explainability: ExplainabilityMetadata;
  generatedAt: Date;
}
