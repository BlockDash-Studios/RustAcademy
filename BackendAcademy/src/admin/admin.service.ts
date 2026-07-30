import { Injectable } from '@nestjs/common';
import { SubmissionsService, ReviewQueueMetrics, FlaggedSubmission } from '../submissions/submissions.service';
import { ReportsService, ReportTriageEntry } from '../reports/reports.service';
import { SocialService, SocialPost, ModerationStatus } from '../social/social.service';
import { CorrelationLoggerService } from '../logging/logger.service';

/**
 * #351: Audit log entry for privileged admin actions.
 */
export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  targetType: string;
  targetId: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  correlationId?: string;
}

export interface AdminDashboardSummary {
  totalUsers: number;
  activeTutors: number;
  totalCourses: number;
  completionRate: number;
}

export interface ReviewQueueDashboard {
  summary: AdminDashboardSummary;
  reviewQueue: ReviewQueueMetrics;
  recentFlags: FlaggedSubmission[];
}

export interface ModerationQueueSummary {
  pending: number;
  flagged: number;
  total: number;
}

@Injectable()
export class AdminService {
  /** #351: Audit log for all privileged actions. */
  private readonly auditLog: AuditLogEntry[] = [];

  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly reportsService: ReportsService,
    private readonly socialService: SocialService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // #351: Audit logging
  // ──────────────────────────────────────────────────────────────────

  private recordAudit(
    action: string,
    actorId: string,
    targetType: string,
    targetId: string,
    options: {
      previousValue?: unknown;
      newValue?: unknown;
      metadata?: Record<string, unknown>;
    } = {},
  ): AuditLogEntry {
    const correlationId = CorrelationLoggerService.getCorrelationId();
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      action,
      actorId,
      targetType,
      targetId,
      previousValue: options.previousValue,
      newValue: options.newValue,
      metadata: options.metadata,
      timestamp: new Date(),
      correlationId,
    };
    this.auditLog.push(entry);
    return entry;
  }

  /**
   * Returns the full audit log, optionally filtered by action type or actor.
   */
  getAuditLog(filters?: { action?: string; actorId?: string; limit?: number }): AuditLogEntry[] {
    let entries = [...this.auditLog];

    if (filters?.action) {
      entries = entries.filter((e) => e.action === filters.action);
    }
    if (filters?.actorId) {
      entries = entries.filter((e) => e.actorId === filters.actorId);
    }

    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters?.limit) {
      entries = entries.slice(0, filters.limit);
    }

    return entries;
  }

  // ──────────────────────────────────────────────────────────────────
  // Dashboard
  // ──────────────────────────────────────────────────────────────────

  async getDashboardSummary(): Promise<AdminDashboardSummary> {
    return {
      totalUsers: 128,
      activeTutors: 24,
      totalCourses: 41,
      completionRate: 0.67,
    };
  }

  async getReviewQueueDashboard(): Promise<ReviewQueueDashboard> {
    const summary = await this.getDashboardSummary();
    const reviewQueue = this.submissionsService.getQueueMetrics();
    const recentFlags = this.submissionsService.getFlaggedSubmissions().slice(-10);
    return { summary, reviewQueue, recentFlags };
  }

  async assignModerator(flagId: string, moderatorId: string): Promise<FlaggedSubmission> {
    const result = await this.submissionsService.assignReviewer(flagId, moderatorId);
    this.recordAudit('assign_moderator', moderatorId, 'flag', flagId, {
      newValue: { assignedTo: moderatorId },
    });
    return result;
  }

  async getFlaggedSubmissions(status?: string): Promise<FlaggedSubmission[]> {
    return this.submissionsService.getFlaggedSubmissions(status as any);
  }

  async getReviewQueueMetrics(): Promise<ReviewQueueMetrics> {
    return this.submissionsService.getQueueMetrics();
  }

  async dismissFlag(flagId: string, dismissedBy: string): Promise<FlaggedSubmission> {
    const result = await this.submissionsService.dismissFlag(flagId, dismissedBy);
    this.recordAudit('dismiss_flag', dismissedBy, 'flag', flagId);
    return result;
  }

  // ──────────────────────────────────────────────────────────────────
  // Report triage
  // ──────────────────────────────────────────────────────────────────

  getPendingReports(): ReportTriageEntry[] {
    return this.reportsService.getAllReports('submitted');
  }

  getReportsInTriage(): ReportTriageEntry[] {
    return this.reportsService.getAllReports('triage');
  }

  assignReport(reportId: string, adminId: string): ReportTriageEntry {
    const report = this.reportsService.transitionReportStatus(reportId, adminId, 'triage', `Assigned to ${adminId}`);
    report.assignedTo = adminId;
    this.recordAudit('assign_report', adminId, 'report', reportId, {
      newValue: { assignedTo: adminId },
    });
    return report;
  }

  escalateReport(reportId: string, adminId: string, note: string): ReportTriageEntry {
    this.recordAudit('escalate_report', adminId, 'report', reportId, { metadata: { note } });
    return this.reportsService.transitionReportStatus(reportId, adminId, 'escalated', note);
  }

  resolveReport(reportId: string, adminId: string, note: string): ReportTriageEntry {
    this.recordAudit('resolve_report', adminId, 'report', reportId, { metadata: { note } });
    return this.reportsService.transitionReportStatus(reportId, adminId, 'resolved', note);
  }

  dismissReport(reportId: string, adminId: string, note: string): ReportTriageEntry {
    this.recordAudit('dismiss_report', adminId, 'report', reportId, { metadata: { note } });
    return this.reportsService.transitionReportStatus(reportId, adminId, 'dismissed', note);
  }

  // ──────────────────────────────────────────────────────────────────
  // Content moderation
  // ──────────────────────────────────────────────────────────────────

  getModerationQueueSummary(): ModerationQueueSummary {
    const queue = this.socialService.getModerationQueue();
    const pending = queue.filter((p) => p.moderationStatus === 'pending').length;
    const flagged = queue.filter((p) => p.moderationStatus === 'flagged').length;
    return { pending, flagged, total: queue.length };
  }

  getPendingContent(): SocialPost[] {
    return this.socialService.getPendingPosts();
  }

  getFlaggedContent(): SocialPost[] {
    return this.socialService.getFlaggedPosts();
  }

  moderatePost(postId: string, moderatorId: string, status: ModerationStatus, reason?: string): SocialPost {
    this.recordAudit('moderate_post', moderatorId, 'post', postId, {
      newValue: { status, reason },
    });
    return this.socialService.moderatePost(postId, moderatorId, { status, reason });
  }

  bulkModerate(moderatorId: string, actions: Array<{ postId: string; status: ModerationStatus; reason?: string }>): number {
    const count = this.socialService.bulkModerate(moderatorId, actions);
    this.recordAudit('bulk_moderate', moderatorId, 'post', 'bulk', {
      newValue: { count, actions },
    });
    return count;
  }
}
