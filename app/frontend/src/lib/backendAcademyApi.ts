export const BACKEND_ACADEMY_API_VERSION = 'v1';

export type XpEventType =
  | 'task.passed'
  | 'course.completed'
  | 'streak.day'
  | 'contribution.created';

export interface PublishXpEvent {
  eventId: string;
  userId: string;
  type: XpEventType;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface XpLedgerEntry extends PublishXpEvent {
  points: number;
  awardedAt: string;
}

export interface XpTotals {
  userId: string;
  totalXp: number;
  entries: XpLedgerEntry[];
}

export type ChatKind = 'dm' | 'room' | 'channel';
export type ReportReason = 'spam' | 'abuse' | 'harassment' | 'other';

export interface ChatMessage {
  userId: string;
  channelId: string;
  kind: ChatKind;
  content: string;
  clientMessageId?: string;
}

export interface ChatMessageResponse extends ChatMessage {
  id: string;
  createdAt: string;
}

export interface ModerationReport {
  reporterId: string;
  messageId: string;
  reason: ReportReason;
  details: string;
}

export interface ModerationQueueItem extends ModerationReport {
  id: string;
  status: 'open';
  createdAt: string;
}

export class BackendAcademyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BackendAcademyApiError';
  }
}

export class BackendAcademyApiClient {
  constructor(private readonly baseUrl: string) {}

  async publishXpEvent(event: PublishXpEvent): Promise<{ accepted: true; eventId: string; totalXp: number }> {
    return this.request('/xp/events', { method: 'POST', body: JSON.stringify(event) });
  }

  async getXpTotals(userId: string): Promise<XpTotals> {
    return this.request(`/xp/${encodeURIComponent(userId)}`);
  }

  async sendMessage(message: ChatMessage): Promise<ChatMessageResponse> {
    return this.request('/chat/messages', { method: 'POST', body: JSON.stringify(message) });
  }

  async reportMessage(report: ModerationReport): Promise<ModerationQueueItem> {
    return this.request('/chat/reports', { method: 'POST', body: JSON.stringify(report) });
  }

  async getModerationQueue(): Promise<ModerationQueueItem[]> {
    return this.request('/chat/moderation/queue');
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/${BACKEND_ACADEMY_API_VERSION}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
    if (!response.ok) {
      throw new BackendAcademyApiError(await response.text(), response.status);
    }
    return response.json() as Promise<T>;
  }
}
