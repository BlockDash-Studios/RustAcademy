import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AnalyticsEvent } from '../analytics/analytics.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { RewardsService } from '../rewards/rewards.service';
import { DatabaseService } from '../database/database.service';
import { SubmissionsService, ReviewQueueMetrics } from '../submissions/submissions.service';/rewards.service';
import { DatabaseService } from '../database/database.service';
import { WalletService } from '../wallet/wallet.service';

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
  apiKeyUsage?: {
    totalKeys: number;
    activeKeys: number;
    totalUsageEvents: number;
    anomaliesDetected: number;
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

export interface CouponRedemptionReport {
  totalCoupons: number;
  totalRedemptions: number;
  totalDiscountApplied: number;
  activeCoupons: number;
  expiredCoupons: number;
  redemptionsByCoupon: Array<{
    code: string;
    redemptions: number;
    totalDiscount: number;
  }>;
}

export type ReportStatus = 'submitted' | 'triage' | 'escalated' | 'resolved' | 'dismissed';

export interface AuditEntry {
  timestamp: Date;
  actor: string;
  fromStatus: ReportStatus | null;
  toStatus: ReportStatus;
  note: string;
}

export interface ReportTriageEntry {
  id: string;
  reporterId: string;
  targetType: 'user' | 'post' | 'comment';
  targetId: string;
  reason: string;
  status: ReportStatus;
  assignedTo: string | null;
  auditTrail: AuditEntry[];
  createdAt: Date;
  updatedAt: Date;
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
    private readonly submissionsService: SubmissionsService,
    private readonly databaseService?: DatabaseService,
    private readonly walletService?: WalletService,
  ) {}

  async getModerationReport(): Promise<{ totalFlagged: number; actionTaken: number; pendingReview: number }> {
    return { totalFlagged: 0, actionTaken: 0, pendingReview: 0 };
  }

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

  async getWalletReconciliationReport(): Promise<import('../wallet/wallet.service').ReconciliationReport | null> {
    if (!this.walletService) return null;
    return this.walletService.reconcileAllWallets();
  }

  async getCouponRedemptionReport(): Promise<CouponRedemptionReport> {
    if (!this.databaseService) {
      return {
        totalCoupons: 0,
        totalRedemptions: 0,
        totalDiscountApplied: 0,
        activeCoupons: 0,
        expiredCoupons: 0,
        redemptionsByCoupon: [],
      };
    }

    const coupons = await this.databaseService.getAllCoupons();
    const redemptions = await this.databaseService.getAllRedemptions(1000);

    const redemptionsByCoupon: CouponRedemptionReport['redemptionsByCoupon'] = [];
    let totalDiscountApplied = 0;

    for (const coupon of coupons) {
      const couponRedemptions = redemptions.filter((r) => r.couponId === coupon.id);
      const totalDiscount = couponRedemptions.reduce((sum, r) => sum + r.discountApplied, 0);
      totalDiscountApplied += totalDiscount;
      redemptionsByCoupon.push({
        code: coupon.code,
        redemptions: couponRedemptions.length,
        totalDiscount,
      });
    }

    const now = new Date();
    return {
      totalCoupons: coupons.length,
      totalRedemptions: redemptions.length,
      totalDiscountApplied,
      activeCoupons: coupons.filter((c) => c.isActive && (!c.expiresAt || c.expiresAt > now)).length,
      expiredCoupons: coupons.filter((c) => c.expiresAt && c.expiresAt <= now).length,
      redemptionsByCoupon,
    };
  }

  async getReviewQueueReport(): Promise<{
    metrics: ReviewQueueMetrics;
    flagsByReason: Record<string, number>;
    averageResolutionTimeMs: number;
  }> {
    const metrics = this.submissionsService.getQueueMetrics();
    const allFlags = this.submissionsService.getFlaggedSubmissions();

    const flagsByReason: Record<string, number> = {};
    for (const flag of allFlags) {
      flagsByReason[flag.flagReason] = (flagsByReason[flag.flagReason] || 0) + 1;
    }

    const resolvedFlags = allFlags.filter(
      (f) => f.resolvedAt && f.createdAt,
    );
    const totalResolutionTime = resolvedFlags.reduce((sum, f) => {
      return sum + (f.resolvedAt!.getTime() - f.createdAt.getTime());
    }, 0);
    const averageResolutionTimeMs = resolvedFlags.length > 0
      ? Math.round(totalResolutionTime / resolvedFlags.length)
      : 0;

    return { metrics, flagsByReason, averageResolutionTimeMs };
  }

  private readonly reports = new Map<string, ReportTriageEntry>();

  createReport(reporterId: string, targetType: ReportTriageEntry['targetType'], targetId: string, reason: string): ReportTriageEntry {
    const id = crypto.randomUUID();
    const now = new Date();
    const entry: ReportTriageEntry = {
      id, reporterId, targetType, targetId, reason,
      status: 'submitted', assignedTo: null,
      auditTrail: [{ timestamp: now, actor: reporterId, fromStatus: null, toStatus: 'submitted', note: 'Report submitted' }],
      createdAt: now, updatedAt: now,
    };
    this.reports.set(id, entry);
    return entry;
  }

  transitionReportStatus(id: string, actor: string, toStatus: ReportStatus, note: string): ReportTriageEntry {
    const report = this.reports.get(id);
    if (!report) throw new NotFoundException({ error: 'REPORT_NOT_FOUND', message: `Report ${id} not found` });
    const fromStatus = report.status;
    report.status = toStatus;
    report.updatedAt = new Date();
    report.auditTrail.push({ timestamp: new Date(), actor, fromStatus, toStatus, note });
    this.reports.set(id, report);
    return report;
  }

  getReport(id: string): ReportTriageEntry {
    const report = this.reports.get(id);
    if (!report) throw new NotFoundException({ error: 'REPORT_NOT_FOUND', message: `Report ${id} not found` });
    return report;
  }

  getAllReports(status?: ReportStatus): ReportTriageEntry[] {
    const all = Array.from(this.reports.values());
    return status ? all.filter((r) => r.status === status) : all;
  }

  getReportsByAssignee(assignee: string): ReportTriageEntry[] {
    return Array.from(this.reports.values()).filter((r) => r.assignedTo === assignee);
  }

  getAuditTrail(id: string): AuditEntry[] {
    return this.getReport(id).auditTrail;
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
      apiKeyUsage: this.getApiKeyUsageSummary(userId),
    };
  }

  private getApiKeyUsageSummary(userId: string): DailyActivityProgress['apiKeyUsage'] {
    return {
      totalKeys: 0,
      activeKeys: 0,
      totalUsageEvents: 0,
      anomaliesDetected: 0,
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
