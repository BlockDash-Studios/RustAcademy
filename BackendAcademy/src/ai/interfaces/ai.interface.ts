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
