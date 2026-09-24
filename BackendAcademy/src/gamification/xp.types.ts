export type XpEventType =
  | 'task.passed'
  | 'course.completed'
  | 'streak.day'
  | 'contribution.created';

export interface XpEvent {
  eventId: string;
  userId: string;
  type: XpEventType;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface XpLedgerEntry extends XpEvent {
  points: number;
  awardedAt: string;
}
