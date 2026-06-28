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