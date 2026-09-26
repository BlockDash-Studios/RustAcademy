import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ContentReport,
  ContentVerdictHook,
  ModerationAuditEntry,
  ModerationState,
  ModerationTargetKind,
  ModerationVerdict,
} from './social.types';

/** Composite key for one piece of moderated content. */
function contentKey(targetKind: ModerationTargetKind, targetId: string): string {
  return `${targetKind}:${targetId}`;
}

/**
 * Content moderation for the social feed (BE-093).
 *
 * Posts and comments can be reported through the REST surface. A report hides
 * the target immediately (`hidden`), so abusive content stops being served while
 * it waits for review. Every state change is appended to an immutable audit
 * trail, and the outcome is decided by a registered `ContentVerdictHook` - the
 * seam the on-chain `governance` contract plugs into to vote on content.
 *
 * State is held in memory like the other social services.
 */
@Injectable()
export class ContentModerationService {
  private readonly reports: ContentReport[] = [];
  private readonly byId = new Map<string, ContentReport>();
  /** content key -> state; an absent key means the content is visible. */
  private readonly states = new Map<string, ModerationState>();
  /** Append-only: entries are never edited or deleted. */
  private readonly audit: ModerationAuditEntry[] = [];
  private readonly verdictHooks: ContentVerdictHook[] = [];
  private nextId = 1;

  /**
   * Files a report and hides the target pending review.
   *
   * Hiding happens here rather than after a moderator acts because the
   * acceptance criterion is that reported content is hidden *pending* review -
   * leaving it up until someone reads the queue would serve exactly the content
   * the report is about.
   */
  report(
    input: {
      targetKind: ModerationTargetKind;
      targetId: string;
      reporterId: string;
      reason: ContentReport['reason'];
      details: string;
    },
    at: Date = new Date(),
  ): ContentReport {
    const report: ContentReport = {
      ...input,
      reportId: `content-report_${this.nextId++}`,
      status: 'open',
      createdAt: at.toISOString(),
    };
    this.reports.push(report);
    this.byId.set(report.reportId, report);

    this.record({
      targetKind: report.targetKind,
      targetId: report.targetId,
      action: 'reported',
      actorId: report.reporterId,
      reportId: report.reportId,
      at: report.createdAt,
      metadata: { reason: report.reason },
    });

    if (this.setState(report.targetKind, report.targetId, 'hidden')) {
      this.record({
        targetKind: report.targetKind,
        targetId: report.targetId,
        action: 'hidden',
        actorId: report.reporterId,
        reportId: report.reportId,
        at: report.createdAt,
        metadata: { pendingReview: true },
      });
    }

    return report;
  }

  /** Open reports, oldest first - the moderation queue. */
  getQueue(): ContentReport[] {
    return this.reports.filter((report) => report.status === 'open');
  }

  getReport(reportId: string): ContentReport {
    const report = this.byId.get(reportId);
    if (!report) throw new NotFoundException(`Unknown content report ${reportId}`);
    return report;
  }

  /** True unless the content is hidden pending review or removed. */
  isVisible(targetKind: ModerationTargetKind, targetId: string): boolean {
    return this.stateOf(targetKind, targetId) === 'visible';
  }

  /** Drops reported content from a read path before it reaches the caller. */
  filterVisible<T>(
    targetKind: ModerationTargetKind,
    items: readonly T[],
    idOf: (item: T) => string,
  ): T[] {
    return items.filter((item) => this.isVisible(targetKind, idOf(item)));
  }

  /**
   * Registers a verdict source; hooks are consulted in registration order.
   *
   * The governance integration is a hook rather than a direct call so BE-093
   * does not depend on the on-chain module: when the `governance` contract is
   * wired up it registers here and queued reports become decidable.
   */
  registerVerdictHook(hook: ContentVerdictHook): void {
    this.verdictHooks.push(hook);
  }

  /**
   * Asks the registered hooks to decide an open report.
   *
   * Returns the applied verdict, or `undefined` when every hook abstained - in
   * which case the content stays hidden and the report stays queued.
   */
  adjudicate(reportId: string): ModerationVerdict | undefined {
    const report = this.getReport(reportId);
    if (report.status !== 'open') {
      throw new BadRequestException(`Content report ${reportId} is already resolved`);
    }

    for (const hook of this.verdictHooks) {
      const verdict = hook.resolve(report);
      if (verdict) {
        this.applyVerdict(report, verdict, hook.name);
        return verdict;
      }
    }

    return undefined;
  }

  /**
   * Applies a decision to the target and resolves the report.
   *
   * `restore` returns the content to `visible`; `remove` leaves it hidden as
   * `removed`. Both outcomes are recorded, so a decision cannot be reversed
   * without a matching audit entry.
   */
  applyVerdict(report: ContentReport, verdict: ModerationVerdict, source = 'manual'): void {
    const at = verdict.decidedAt ?? new Date().toISOString();
    const outcome: ModerationState = verdict.outcome === 'remove' ? 'removed' : 'visible';

    this.setState(report.targetKind, report.targetId, outcome);
    report.status = 'resolved';

    this.record({
      targetKind: report.targetKind,
      targetId: report.targetId,
      action: verdict.outcome === 'remove' ? 'removed' : 'restored',
      actorId: verdict.decidedBy,
      reportId: report.reportId,
      at,
      metadata: { outcome: verdict.outcome, source },
    });
  }

  /** Append-only audit trail, oldest first. */
  getAuditTrail(filter?: {
    targetKind?: ModerationTargetKind;
    targetId?: string;
  }): ModerationAuditEntry[] {
    return this.audit.filter(
      (entry) =>
        (!filter?.targetKind || entry.targetKind === filter.targetKind) &&
        (!filter?.targetId || entry.targetId === filter.targetId),
    );
  }

  private stateOf(targetKind: ModerationTargetKind, targetId: string): ModerationState {
    return this.states.get(contentKey(targetKind, targetId)) ?? 'visible';
  }

  /** Returns true when the state actually changed. */
  private setState(
    targetKind: ModerationTargetKind,
    targetId: string,
    state: ModerationState,
  ): boolean {
    if (this.stateOf(targetKind, targetId) === state) return false;
    this.states.set(contentKey(targetKind, targetId), state);
    return true;
  }

  private record(entry: Omit<ModerationAuditEntry, 'auditId'>): ModerationAuditEntry {
    const recorded: ModerationAuditEntry = {
      ...entry,
      auditId: `moderation-audit_${this.nextId++}`,
    };
    this.audit.push(recorded);
    return recorded;
  }
}
