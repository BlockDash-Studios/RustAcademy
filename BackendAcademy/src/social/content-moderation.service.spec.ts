import { BadRequestException } from '@nestjs/common';
import { ContentModerationService } from './content-moderation.service';
import { ContentVerdictHook } from './social.types';

describe('ContentModerationService', () => {
  it('hides reported content pending review and keeps an audit trail', () => {
    const service = new ContentModerationService();

    expect(service.isVisible('post', 'post-1')).toBe(true);

    const report = service.report({
      targetKind: 'post',
      targetId: 'post-1',
      reporterId: 'user-2',
      reason: 'spam',
      details: 'Duplicated showcase',
    });

    expect(service.isVisible('post', 'post-1')).toBe(false);
    expect(service.getQueue()).toEqual([report]);
    expect(
      service.getAuditTrail({ targetKind: 'post', targetId: 'post-1' }).map((e) => e.action),
    ).toEqual(['reported', 'hidden']);
    // Comments are keyed separately, so hiding a post does not hide a comment
    // that happens to share its id.
    expect(service.isVisible('comment', 'post-1')).toBe(true);
    expect(
      service.filterVisible('post', ['post-1', 'post-2'], (id) => id),
    ).toEqual(['post-2']);
  });

  it('restores or removes content when a verdict hook decides', () => {
    const service = new ContentModerationService();
    const consulted: string[] = [];
    const hook: ContentVerdictHook = {
      name: 'governance',
      resolve: (report) => {
        consulted.push(report.reportId);
        return { reportId: report.reportId, outcome: 'restore', decidedBy: 'GABCD...' };
      },
    };
    service.registerVerdictHook(hook);

    const report = service.report({
      targetKind: 'post',
      targetId: 'post-2',
      reporterId: 'user-3',
      reason: 'abuse',
      details: 'Harassment in the post body',
    });

    const verdict = service.adjudicate(report.reportId);

    expect(verdict?.outcome).toBe('restore');
    expect(consulted).toEqual([report.reportId]);
    expect(service.isVisible('post', 'post-2')).toBe(true);
    expect(service.getQueue()).toHaveLength(0);
    expect(service.getAuditTrail().map((e) => e.action)).toEqual([
      'reported',
      'hidden',
      'restored',
    ]);
    expect(() => service.adjudicate(report.reportId)).toThrow(BadRequestException);
  });

  it('leaves content hidden while every hook abstains', () => {
    const service = new ContentModerationService();
    service.registerVerdictHook({ name: 'governance', resolve: () => undefined });

    const report = service.report({
      targetKind: 'comment',
      targetId: 'comment-1',
      reporterId: 'user-4',
      reason: 'other',
      details: 'Off-topic',
    });

    expect(service.adjudicate(report.reportId)).toBeUndefined();
    expect(service.isVisible('comment', 'comment-1')).toBe(false);
    expect(service.getQueue()).toHaveLength(1);
  });
});
