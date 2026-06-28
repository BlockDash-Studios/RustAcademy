"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
let AiService = class AiService {
    constructor() {
        this.chatHistory = new Map();
        this.hints = new Map();
        this.initializeSampleHints();
    }
    async processChatRequest(createChatRequestDto) {
        const { message, userId, context } = createChatRequestDto;
        const response = this.generateAiResponse(message, context);
        const chatMessage = {
            id: (0, uuid_1.v4)(),
            userId,
            message,
            response,
            timestamp: new Date(),
            context,
        };
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
    async getHint(getHintDto) {
        const { challengeId, difficulty = 1 } = getHintDto;
        const challengeHints = this.hints.get(challengeId) || [];
        const hint = challengeHints.find(h => h.difficulty === difficulty) || challengeHints[0];
        if (!hint) {
            return {
                hint: "No hints available for this challenge yet. Keep trying!",
                hintId: (0, uuid_1.v4)(),
                difficulty: 1,
            };
        }
        hint.usedCount++;
        return {
            hint: hint.hint,
            hintId: hint.id,
            difficulty: hint.difficulty,
        };
    }
    async getChatHistory(userId) {
        return this.chatHistory.get(userId) || [];
    }
    generateAiResponse(userMessage, context) {
        const responses = [
            "That's a great question! Let me help you work through that. Based on what you've shared, I think the first thing you should understand is the core concept behind the problem.",
            "I see what you're working on. Let's break this down step by step. What part of the problem are you finding most challenging right now?",
            "Good thinking! You're on the right track. To move forward, I'd recommend reviewing the documentation on this topic and trying to implement a small piece first.",
            "That's a common challenge many developers face. Let's think about this differently - what if we approach it from another angle?",
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }
    initializeSampleHints() {
        const sampleHints = [
            {
                id: (0, uuid_1.v4)(),
                challengeId: "sample-challenge-001",
                hint: "Start by understanding the problem requirements thoroughly. List out all the inputs and expected outputs.",
                difficulty: 1,
                usedCount: 0,
            },
            {
                id: (0, uuid_1.v4)(),
                challengeId: "sample-challenge-001",
                hint: "Consider edge cases - what happens if the input is empty, null, or outside the expected range?",
                difficulty: 2,
                usedCount: 0,
            },
            {
                id: (0, uuid_1.v4)(),
                challengeId: "sample-challenge-001",
                hint: "Try to implement a brute-force solution first, then optimize it. This helps you understand the problem better.",
                difficulty: 3,
                usedCount: 0,
            },
        ];
        this.hints.set("sample-challenge-001", sampleHints);
    }
};
exports.AiService = AiService;
exports.AiService = AiService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], AiService);
//# sourceMappingURL=ai.service.js.map