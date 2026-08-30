import { NotFoundException } from '@nestjs/common';
import { OnboardingService, VersionConflictError } from './onboarding.service';
import { OnboardingProgress } from './onboarding.entity';

describe('OnboardingService — durable persistence (BA-044)', () => {
  let service: OnboardingService;

  beforeEach(() => {
    service = new OnboardingService();
  });

  it('completeStep() is idempotent and only records a step once', async () => {
    const progress = await service.create({
      userId: 'user-o1',
      currentStep: 'step-1',
      totalSteps: 3,
    });

    await service.completeStep(progress.id, 'step-1');
    await service.completeStep(progress.id, 'step-1');

    expect(progress.completedSteps.filter((s) => s === 'step-1')).toHaveLength(
      1,
    );
    // Checkpoint also recorded once.
    expect(service.getCheckpoints(progress.id)).toHaveLength(1);
  });

  it('completing all steps marks progress complete with a completedAt timestamp', async () => {
    const progress = await service.create({
      userId: 'user-o2',
      currentStep: 'step-0',
      totalSteps: 2,
    });

    await service.completeStep(progress.id, 'step-1');
    await service.completeStep(progress.id, 'step-2');

    expect(progress.isComplete).toBe(true);
    expect(progress.completedAt).toBeInstanceOf(Date);
  });

  it('update() rejects stale versions with VersionConflictError', async () => {
    const progress = await service.create({
      userId: 'user-o3',
      currentStep: 'step-0',
      totalSteps: 3,
    });

    const v0 = progress.version;

    await service.completeStep(progress.id, 'step-1');
    const latestVersion = progress.version;
    expect(latestVersion).toBeGreaterThan(v0);

    // A device that captured the old version tries to write.
    await expect(
      service.update(progress.id, { currentStep: 'step-9', expectedVersion: v0 }),
    ).rejects.toThrow(VersionConflictError);
  });

  it('update() is idempotent when nothing changes (version does not advance)', async () => {
    const progress = await service.create({
      userId: 'user-o4',
      currentStep: 'step-0',
      totalSteps: 3,
    });
    const beforeVersion = progress.version;

    await service.update(progress.id, { currentStep: 'step-0' });

    expect(progress.version).toBe(beforeVersion);
  });

  it('update() merges completedSteps rather than erasing them', async () => {
    const progress = await service.create({
      userId: 'user-o5',
      currentStep: 'step-0',
      totalSteps: 4,
    });
    await service.completeStep(progress.id, 'step-1');

    await service.update(progress.id, { completedSteps: ['step-2', 'step-3'] });

    expect(progress.completedSteps).toEqual(
      expect.arrayContaining(['step-1', 'step-2', 'step-3']),
    );
  });

  it('exportState()/importState() round-trips durable progress across a mock restart', async () => {
    const progress = await service.create({
      userId: 'user-o6',
      currentStep: 'step-0',
      totalSteps: 3,
    });
    await service.completeStep(progress.id, 'step-1');
    await service.completeStep(progress.id, 'step-2');

    // Capture the durable state, then simulate a fresh service (new process).
    const persisted = service.exportState();

    const restarted = new OnboardingService();
    const restoredCount = restarted.importState(persisted);

    expect(restoredCount).toBe(1);
    const restored = await restarted.findByUserId('user-o6');

    expect(restored).not.toBeNull();
    expect(restored!.currentStep).toBe('step-2');
    expect(restored!.completedSteps).toEqual(
      expect.arrayContaining(['step-1', 'step-2']),
    );
    // Versioned steps and checkpoint metadata survive the restart.
    expect(restarted.getCheckpoints(restored!.id).length).toBe(2);
  });

  it('throws NotFoundException for unknown progress', async () => {
    await expect(
      service.completeStep('missing-id', 'step-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
