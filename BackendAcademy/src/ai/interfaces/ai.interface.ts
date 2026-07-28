export interface ChatMessage {
  id: string;
  userId: string;
  message: string;
  response: string;
  timestamp: Date;
  context?: Record<string, any>;
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
