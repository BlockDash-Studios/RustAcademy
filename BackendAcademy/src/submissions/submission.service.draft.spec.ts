import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubmissionService } from './submission.service';
import { SubmissionStatus } from './interfaces/submission-status.enum';
import { SaveDraftDto } from './dto/save-draft.dto';

describe('SubmissionService — draft methods', () => {
  let service: SubmissionService;

  const USER_A = 'user-aaa';
  const USER_B = 'user-bbb';
  const TASK_1 = 'task-001';
  const TASK_2 = 'task-002';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubmissionService],
    }).compile();

    service = module.get<SubmissionService>(SubmissionService);
  });

  // -------------------------------------------------------------------------
  // saveDraft
  // -------------------------------------------------------------------------

  describe('saveDraft', () => {
    it('creates a new draft with DRAFT status and isDraft=true', async () => {
      const dto: SaveDraftDto = { userId: USER_A, taskId: TASK_1, content: 'partial code' };
      const draft = await service.saveDraft(dto);

      expect(draft.id).toBeDefined();
      expect(draft.userId).toBe(USER_A);
      expect(draft.taskId).toBe(TASK_1);
      expect(draft.content).toBe('partial code');
      expect(draft.status).toBe(SubmissionStatus.DRAFT);
      expect(draft.isDraft).toBe(true);
      expect(draft.draftSavedAt).toBeInstanceOf(Date);
    });

    it('defaults content to an empty string when not provided', async () => {
      const dto: SaveDraftDto = { userId: USER_A, taskId: TASK_1 };
      const draft = await service.saveDraft(dto);

      expect(draft.content).toBe('');
    });

    it('stores the fileUrl when provided', async () => {
      const dto: SaveDraftDto = {
        userId: USER_A,
        taskId: TASK_1,
        fileUrl: 'https://example.com/file.rs',
      };
      const draft = await service.saveDraft(dto);

      expect(draft.fileUrl).toBe('https://example.com/file.rs');
    });

    it('upserts an existing draft for the same userId+taskId instead of creating a new one', async () => {
      const first = await service.saveDraft({ userId: USER_A, taskId: TASK_1, content: 'v1' });
      const second = await service.saveDraft({ userId: USER_A, taskId: TASK_1, content: 'v2' });

      expect(second.id).toBe(first.id);
      expect(second.content).toBe('v2');
    });

    it('updates draftSavedAt on upsert', async () => {
      const first = await service.saveDraft({ userId: USER_A, taskId: TASK_1, content: 'v1' });
      const savedAtFirst = first.draftSavedAt!.getTime();

      // Advance time slightly before saving again
      await new Promise(resolve => setTimeout(resolve, 5));

      const second = await service.saveDraft({ userId: USER_A, taskId: TASK_1, content: 'v2' });
      expect(second.draftSavedAt!.getTime()).toBeGreaterThanOrEqual(savedAtFirst);
    });

    it('creates separate drafts for different userId+taskId combinations', async () => {
      const d1 = await service.saveDraft({ userId: USER_A, taskId: TASK_1 });
      const d2 = await service.saveDraft({ userId: USER_A, taskId: TASK_2 });
      const d3 = await service.saveDraft({ userId: USER_B, taskId: TASK_1 });

      expect(d1.id).not.toBe(d2.id);
      expect(d1.id).not.toBe(d3.id);
      expect(d2.id).not.toBe(d3.id);
    });

    it('does not affect non-draft submissions when checking for existing drafts', async () => {
      // Create a regular (published) submission first
      const regular = await service.create({ userId: USER_A, taskId: TASK_1, content: 'final' });
      expect(regular.isDraft).toBe(false);

      // Saving a draft should create a new entity, not upsert the regular one
      const draft = await service.saveDraft({ userId: USER_A, taskId: TASK_1, content: 'wip' });
      expect(draft.id).not.toBe(regular.id);
      expect(draft.isDraft).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // findDraftsByUserId
  // -------------------------------------------------------------------------

  describe('findDraftsByUserId', () => {
    it('returns an empty array when the user has no drafts', async () => {
      const drafts = await service.findDraftsByUserId(USER_A);
      expect(drafts).toEqual([]);
    });

    it('returns only the drafts belonging to the given user', async () => {
      await service.saveDraft({ userId: USER_A, taskId: TASK_1 });
      await service.saveDraft({ userId: USER_A, taskId: TASK_2 });
      await service.saveDraft({ userId: USER_B, taskId: TASK_1 });

      const draftsA = await service.findDraftsByUserId(USER_A);
      expect(draftsA).toHaveLength(2);
      expect(draftsA.every(d => d.userId === USER_A)).toBe(true);

      const draftsB = await service.findDraftsByUserId(USER_B);
      expect(draftsB).toHaveLength(1);
      expect(draftsB[0].userId).toBe(USER_B);
    });

    it('does not include published (non-draft) submissions', async () => {
      // Save a draft then publish it
      const draft = await service.saveDraft({ userId: USER_A, taskId: TASK_1, content: 'wip' });
      await service.publishDraft(draft.id);

      const drafts = await service.findDraftsByUserId(USER_A);
      expect(drafts).toHaveLength(0);
    });

    it('does not include regular submissions created via create()', async () => {
      await service.create({ userId: USER_A, taskId: TASK_1, content: 'final' });
      const drafts = await service.findDraftsByUserId(USER_A);
      expect(drafts).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // publishDraft
  // -------------------------------------------------------------------------

  describe('publishDraft', () => {
    it('transitions a draft to PENDING status', async () => {
      const draft = await service.saveDraft({ userId: USER_A, taskId: TASK_1, content: 'done' });
      const published = await service.publishDraft(draft.id);

      expect(published.status).toBe(SubmissionStatus.PENDING);
    });

    it('clears isDraft flag after publishing', async () => {
      const draft = await service.saveDraft({ userId: USER_A, taskId: TASK_1 });
      const published = await service.publishDraft(draft.id);

      expect(published.isDraft).toBe(false);
    });

    it('clears draftSavedAt after publishing', async () => {
      const draft = await service.saveDraft({ userId: USER_A, taskId: TASK_1 });
      const published = await service.publishDraft(draft.id);

      expect(published.draftSavedAt).toBeUndefined();
    });

    it('sets submittedAt to the publish time', async () => {
      const before = new Date();
      const draft = await service.saveDraft({ userId: USER_A, taskId: TASK_1 });
      const published = await service.publishDraft(draft.id);
      const after = new Date();

      expect(published.submittedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(published.submittedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('throws NotFoundException when submission does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await expect(service.publishDraft(fakeId)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when submission is not a draft', async () => {
      // Create a regular submission (isDraft = false)
      const regular = await service.create({ userId: USER_A, taskId: TASK_1, content: 'code' });
      await expect(service.publishDraft(regular.id)).rejects.toThrow(BadRequestException);
    });

    it('allows the published submission to be found via findByUserId', async () => {
      const draft = await service.saveDraft({ userId: USER_A, taskId: TASK_1, content: 'done' });
      await service.publishDraft(draft.id);

      const all = await service.findByUserId(USER_A);
      const match = all.find(s => s.id === draft.id);
      expect(match).toBeDefined();
      expect(match!.isDraft).toBe(false);
      expect(match!.status).toBe(SubmissionStatus.PENDING);
    });

    it('makes the submission no longer appear in findDraftsByUserId', async () => {
      const draft = await service.saveDraft({ userId: USER_A, taskId: TASK_1 });
      await service.publishDraft(draft.id);

      const drafts = await service.findDraftsByUserId(USER_A);
      expect(drafts.find(d => d.id === draft.id)).toBeUndefined();
    });
  });
});
