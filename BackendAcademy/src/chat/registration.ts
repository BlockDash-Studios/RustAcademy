import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { DomainEventBus } from './domain-event-bus';
import { XpEvent, XpEventType, XpLedgerEntry } from './xp.types';

const XP_BY_EVENT: Record<XpEventType, number> = {
  'task.passed': 10,
  'course.completed': 100,
  'streak.day': 5,
  'contribution.created': 25,
};

@Injectable()
export class XpService implements OnModuleInit, OnModuleDestroy {
  private readonly ledger = new Map<string, XpLedgerEntry>();
  private subscription?: Subscription;

  constructor(private readonly eventBus: DomainEventBus) {}

  onModuleInit(): void {
    this.subscription = this.eventBus.subscribe((event) => this.award(event));
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  award(event: XpEvent): XpLedgerEntry | null {
    if (this.ledger.has(event.eventId)) {
      return null;
    }

    const entry: XpLedgerEntry = {
      ...event,
      points: XP_BY_EVENT[event.type],
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      awardedAt: new Date().toISOString(),
    };
    this.ledger.set(event.eventId, entry);
    return entry;
  }

  getBalance(userId: string): number {
    return this.getLedger(userId).reduce((total, entry) => total + entry.points, 0);
  }

  getLedger(userId: string): XpLedgerEntry[] {
    return [...this.ledger.values()].filter((entry) => entry.userId === userId);
  }

  getTotals(userId: string) {
    const entries = this.getLedger(userId);
    return { userId, totalXp: entries.reduce((total, entry) => total + entry.points, 0), entries };
  }
}
