import { Injectable } from '@nestjs/common';
import { CreateChatRequestDto } from './dto/create-chat-request.dto';
import { GetHintDto } from './dto/get-hint.dto';
import { AiChatResponse, AiHintResponse, ChatMessage, Hint } from './interfaces/ai.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AiService {
  private chatHistory: Map<string, ChatMessage[]> = new Map();
  private hints: Map<string, Hint[]> = new Map();

  constructor() {
    // Initialize some sample hints for demonstration
    this.initializeSampleHints();
  }

  async processChatRequest(createChatRequestDto: CreateChatRequestDto): Promise<AiChatResponse> {
    const { message, userId, context } = createChatRequestDto;
    
    // Generate AI response (in a real implementation, this would call an actual AI service)
    const response = this.generateAiResponse(message, context);
    
    // Create message object
    const chatMessage: ChatMessage = {
      id: uuidv4(),
      userId,
      message,
      response,
      timestamp: new Date(),
      context,
    };

    // Store in chat history
    if (!this.chatHistory.has(userId)) {
      this.chatHistory.set(userId, []);
    }
    this.chatHistory.get(userId).push(chatMessage);

    return {
      response: chatMessage.response,
      timestamp: chatMessage.timestamp,
      messageId: chatMessage.id,
    };
  }

  async getHint(getHintDto: GetHintDto): Promise<AiHintResponse> {
    const { challengeId, difficulty = 1 } = getHintDto;
    
    // Get hints for this challenge
    const challengeHints = this.hints.get(challengeId) || [];
    
    // Find a hint matching the requested difficulty or return the first available
    const hint = challengeHints.find(h => h.difficulty === difficulty) || challengeHints[0];
    
    if (!hint) {
      return {
        hint: "No hints available for this challenge yet. Keep trying!",
        hintId: uuidv4(),
        difficulty: 1,
      };
    }

    // Increment usage count
    hint.usedCount++;

    return {
      hint: hint.hint,
      hintId: hint.id,
      difficulty: hint.difficulty,
    };
  }

  async getChatHistory(userId: string): Promise<ChatMessage[]> {
    return this.chatHistory.get(userId) || [];
  }

  private generateAiResponse(userMessage: string, context?: Record<string, any>): string {
    // This is a placeholder for actual AI integration
    const responses = [
      "That's a great question! Let me help you work through that. Based on what you've shared, I think the first thing you should understand is the core concept behind the problem.",
      "I see what you're working on. Let's break this down step by step. What part of the problem are you finding most challenging right now?",
      "Good thinking! You're on the right track. To move forward, I'd recommend reviewing the documentation on this topic and trying to implement a small piece first.",
      "That's a common challenge many developers face. Let's think about this differently - what if we approach it from another angle?",
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private initializeSampleHints() {
    // Sample challenge with hints of varying difficulty
    const sampleHints: Hint[] = [
      {
        id: uuidv4(),
        challengeId: "sample-challenge-001",
        hint: "Start by understanding the problem requirements thoroughly. List out all the inputs and expected outputs.",
        difficulty: 1,
        usedCount: 0,
      },
      {
        id: uuidv4(),
        challengeId: "sample-challenge-001",
        hint: "Consider edge cases - what happens if the input is empty, null, or outside the expected range?",
        difficulty: 2,
        usedCount: 0,
      },
      {
        id: uuidv4(),
        challengeId: "sample-challenge-001",
        hint: "Try to implement a brute-force solution first, then optimize it. This helps you understand the problem better.",
        difficulty: 3,
        usedCount: 0,
      },
    ];
    
    this.hints.set("sample-challenge-001", sampleHints);
  }
}