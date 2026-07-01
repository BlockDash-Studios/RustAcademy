import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AnalyticsEvent } from '../analytics/analytics.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { RewardsService } from '../rewards/rewards.service';

export interface DailyActivitySummary {
  date: string;
  totalEvents: number;
  uniqueEventTypes: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  eventBreakdown: Record<string, number>;
}

export interface DailyActivityProgress {
  totalDays: number;
  activeDays: number;
  inactiveDays: number;
  activityRate: number;
  totalEvents: number;
  uniqueEventTypes: number;
  currentActiveStreak: number;
  longestActiveStreak: number;
  rewards: {
    xp: number;
    level: number;
    xpToNextLevel: number;
    currentLevelThreshold: number;
    nextLevelThreshold: number | null;
    currentStreak: number;
    lastActivityDate: string | null;
  };
}

export interface DailySummaryReport {
  userId: string;
  window: {
    startDate: string;
    endDate: string;
  };
  summaries: DailyActivitySummary[];
  progress: DailyActivityProgress;
}

interface DailyBucket {
  totalEvents: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  eventBreakdown: Record<string, number>;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly rewardsService: RewardsService,
  ) {}

  async getDailySummaryReport(
    userId: string,
    startDate?: string,
    endDate?: string,
    includeEmptyDays: boolean = true,
  ): Promise<DailySummaryReport> {
    const { start, end } = this.resolveDateWindow(startDate, endDate);
    const allEvents = await this.analyticsService.getEventsByUserId(userId);
    const filteredEvents = allEvents.filter((event) =>
      this.isWithinRange(event.timestamp, start, end),
    );

    const fullSummaries = this.buildDailySummaries(filteredEvents, start, end, true);
    const summaries = includeEmptyDays
      ? fullSummaries
      : fullSummaries.filter((summary) => summary.totalEvents > 0);

    return {
      userId,
      window: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      summaries,
      progress: this.buildProgress(userId, filteredEvents, fullSummaries),
    };
  }

  private buildDailySummaries(
    events: AnalyticsEvent[],
    start: Date,
    end: Date,
    includeEmptyDays: boolean,
  ): DailyActivitySummary[] {
    const buckets = new Map<string, DailyBucket>();

    for (const event of events) {
      const dateKey = this.toDateKey(event.timestamp);
      const current = buckets.get(dateKey) ?? {
        totalEvents: 0,
        firstActivityAt: null,
        lastActivityAt: null,
        eventBreakdown: {},
      };

      current.totalEvents += 1;
      current.eventBreakdown[event.eventType] =
        (current.eventBreakdown[event.eventType] ?? 0) + 1;

      const eventIso = event.timestamp.toISOString();
      current.firstActivityAt =
        current.firstActivityAt && current.firstActivityAt < eventIso
          ? current.firstActivityAt
          : eventIso;
      current.lastActivityAt =
        current.lastActivityAt && current.lastActivityAt > eventIso
          ? current.lastActivityAt
          : eventIso;

      buckets.set(dateKey, current);
    }

    const summaries = includeEmptyDays
      ? this.buildDateRange(start, end).map((date) =>
          this.toSummary(date, buckets.get(date)),
        )
      : Array.from(buckets.entries()).map(([date, bucket]) =>
          this.toSummary(date, bucket),
        );

    return summaries.sort((a, b) => a.date.localeCompare(b.date));
  }

  private buildProgress(
    userId: string,
    events: AnalyticsEvent[],
    summaries: DailyActivitySummary[],
  ): DailyActivityProgress {
    const activeDays = summaries.filter((summary) => summary.totalEvents > 0).length;
    const eventTypes = new Set(events.map((event) => event.eventType));
    const rewards = this.getRewardsProgress(userId);

    return {
      totalDays: summaries.length,
      activeDays,
      inactiveDays: Math.max(summaries.length - activeDays, 0),
      activityRate:
        summaries.length > 0 ? this.round2((activeDays / summaries.length) * 100) : 0,
      totalEvents: events.length,
      uniqueEventTypes: eventTypes.size,
      currentActiveStreak: this.getCurrentActiveStreak(summaries),
      longestActiveStreak: this.getLongestActiveStreak(summaries),
      rewards,
    };
  }

  private getRewardsProgress(userId: string): DailyActivityProgress['rewards'] {
    try {
      const progression = this.rewardsService.getUserProgression(userId);
      return {
        xp: progression.xp,
        level: progression.level,
        xpToNextLevel: progression.xpToNextLevel,
        currentLevelThreshold: progression.currentLevelThreshold,
        nextLevelThreshold: progression.nextLevelThreshold,
        currentStreak: progression.streak.currentStreak,
        lastActivityDate: progression.streak.lastActivityDate,
      };
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }

      return {
        xp: 0,
        level: 1,
        xpToNextLevel: 0,
        currentLevelThreshold: 0,
        nextLevelThreshold: null,
        currentStreak: 0,
        lastActivityDate: null,
      };
    }
  }

  private toSummary(date: string, bucket?: DailyBucket): DailyActivitySummary {
    const eventBreakdown = bucket?.eventBreakdown ?? {};

    return {
      date,
      totalEvents: bucket?.totalEvents ?? 0,
      uniqueEventTypes: Object.keys(eventBreakdown).length,
      firstActivityAt: bucket?.firstActivityAt ?? null,
      lastActivityAt: bucket?.lastActivityAt ?? null,
      eventBreakdown,
    };
  }

  private getCurrentActiveStreak(summaries: DailyActivitySummary[]): number {
    let streak = 0;

    for (let index = summaries.length - 1; index >= 0; index -= 1) {
      if (summaries[index].totalEvents === 0) {
        break;
      }
      streak += 1;
    }

    return streak;
  }

  private getLongestActiveStreak(summaries: DailyActivitySummary[]): number {
    let longest = 0;
    let current = 0;

    for (const summary of summaries) {
      if (summary.totalEvents > 0) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }

    return longest;
  }

  private buildDateRange(start: Date, end: Date): string[] {
    const dates: string[] = [];
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const last = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    );

    while (cursor <= last) {
      dates.push(this.toDateKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
  }

  private toDateKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
      date.getUTCDate(),
    ).padStart(2, '0')}`;
  }

  private isWithinRange(date: Date, start: Date, end: Date): boolean {
    return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
  }

  private resolveDateWindow(
    startDate?: string,
    endDate?: string,
  ): { start: Date; end: Date } {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        'startDate and endDate must be valid ISO-8601 strings.',
      );
    }

    if (start > end) {
      throw new BadRequestException(
        'startDate must be earlier than or equal to endDate.',
      );
    }

    return { start, end };
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
