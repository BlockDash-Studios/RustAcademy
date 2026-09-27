import { ForbiddenException, Injectable, TooManyRequestsException } from '@nestjs/common';

export interface ChatMessage {
  id: string;
  userId: string;
  channelId: string;
  kind: 'dm' | 'room' | 'channel';
  content: string;
  createdAt: string;
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  messageId: string;
  reason: string;
  details: string;
  status: 'open';
  createdAt: string;
}

@Injectable()
export class ModerationService {
  private readonly messages: ChatMessage[] = [];
  private readonly reports: ModerationReport[] = [];
  private readonly violations = new Map<string, number>();
  private readonly mutedUntil = new Map<string, number>();
  private readonly rateWindows = new Map<string, number[]>();
  private nextId = 1;

  private readonly maxMessagesPerWindow = 20;
  private readonly rateWindowMs = 60_000;
  private readonly muteAfterViolations = 3;
  private readonly muteDurationMs = 15 * 60_000;
  private readonly abusiveWords = ['asshole', 'bitch', 'fuck', 'shit'];

  sendMessage(input: Omit<ChatMessage, 'id' | 'createdAt'>): ChatMessage {
    const now = Date.now();
    this.assertRateLimit(input.userId, now);
    const mutedUntil = this.mutedUntil.get(input.userId) ?? 0;
    if (mutedUntil > now) {
      throw new ForbiddenException(`User is muted until ${new Date(mutedUntil).toISOString()}`);
    }

    if (this.containsProfanity(input.content)) {
      const count = (this.violations.get(input.userId) ?? 0) + 1;
      this.violations.set(input.userId, count);
      if (count >= this.muteAfterViolations) {
        this.mutedUntil.set(input.userId, now + this.muteDurationMs);
      }
      throw new ForbiddenException('Message rejected by moderation');
    }

    const message: ChatMessage = { ...input, id: `msg_${this.nextId++}`, createdAt: new Date(now).toISOString() };
    this.messages.push(message);
    return message;
  }

  report(input: Omit<ModerationReport, 'id' | 'status' | 'createdAt'>): ModerationReport {
    const report: ModerationReport = {
      ...input,
      id: `report_${this.nextId++}`,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    this.reports.push(report);
    return report;
  }

  getQueue(): ModerationReport[] {
    return [...this.reports];
  }

  isMuted(userId: string): boolean {
    return (this.mutedUntil.get(userId) ?? 0) > Date.now();
  }

  private containsProfanity(content: string): boolean {
    const normalized = content.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    return this.abusiveWords.some((word) => new RegExp(`\\b${word}\\b`).test(normalized));
  }

  private assertRateLimit(userId: string, now: number): void {
    const recent = (this.rateWindows.get(userId) ?? []).filter((timestamp) => now - timestamp < this.rateWindowMs);
    if (recent.length >= this.maxMessagesPerWindow) {
      throw new TooManyRequestsException('Chat rate limit exceeded');
    }
    recent.push(now);
    this.rateWindows.set(userId, recent);
  }
}
