import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { RewardsService } from '../rewards/rewards.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;

  const analyticsService = {
    getEventsByUserId: jest.fn(),
  } as unknown as AnalyticsService;

  const rewardsService = {
    getUserProgression: jest.fn(),
  } as unknown as RewardsService;

  beforeEach(() => {
    service = new ReportsService(analyticsService, rewardsService);
    jest.clearAllMocks();
  });

  it('builds daily summaries with empty days and progress metrics', async () => {
    (analyticsService.getEventsByUserId as jest.Mock).mockResolvedValue([
      {
        id: '1',
        userId: 'learner-1',
        eventType: 'course_completed',
        timestamp: new Date('2026-07-01T09:00:00.000Z'),
      },
      {
        id: '2',
        userId: 'learner-1',
        eventType: 'lesson_viewed',
        timestamp: new Date('2026-07-01T11:00:00.000Z'),
      },
      {
        id: '3',
        userId: 'learner-1',
        eventType: 'challenge_started',
        timestamp: new Date('2026-07-03T15:30:00.000Z'),
      },
    ]);
    (rewardsService.getUserProgression as jest.Mock).mockReturnValue({
      xp: 450,
      level: 4,
      xpToNextLevel: 50,
      currentLevelThreshold: 400,
      nextLevelThreshold: 500,
      streak: {
        currentStreak: 2,
        lastActivityDate: '2026-07-03T15:30:00.000Z',
      },
    });

    const report = await service.getDailySummaryReport(
      'learner-1',
      '2026-07-01T00:00:00.000Z',
      '2026-07-03T23:59:59.999Z',
      true,
    );

    expect(report.summaries).toHaveLength(3);
    expect(report.summaries[0]).toMatchObject({
      date: '2026-07-01',
      totalEvents: 2,
      uniqueEventTypes: 2,
    });
    expect(report.summaries[1]).toMatchObject({
      date: '2026-07-02',
      totalEvents: 0,
    });
    expect(report.progress).toMatchObject({
      totalDays: 3,
      activeDays: 2,
      inactiveDays: 1,
      activityRate: 66.67,
      totalEvents: 3,
      uniqueEventTypes: 3,
      currentActiveStreak: 1,
      longestActiveStreak: 1,
    });
    expect(report.progress.rewards.level).toBe(4);
  });

  it('omits empty days when requested', async () => {
    (analyticsService.getEventsByUserId as jest.Mock).mockResolvedValue([
      {
        id: '1',
        userId: 'learner-1',
        eventType: 'course_completed',
        timestamp: new Date('2026-07-01T09:00:00.000Z'),
      },
    ]);
    (rewardsService.getUserProgression as jest.Mock).mockReturnValue({
      xp: 100,
      level: 2,
      xpToNextLevel: 20,
      currentLevelThreshold: 80,
      nextLevelThreshold: 120,
      streak: {
        currentStreak: 1,
        lastActivityDate: '2026-07-01T09:00:00.000Z',
      },
    });

    const report = await service.getDailySummaryReport(
      'learner-1',
      '2026-07-01T00:00:00.000Z',
      '2026-07-03T23:59:59.999Z',
      false,
    );

    expect(report.summaries).toHaveLength(1);
    expect(report.summaries[0].date).toBe('2026-07-01');
    expect(report.progress.inactiveDays).toBe(2);
  });

  it('falls back to zeroed rewards progress when progression is missing', async () => {
    (analyticsService.getEventsByUserId as jest.Mock).mockResolvedValue([]);
    (rewardsService.getUserProgression as jest.Mock).mockImplementation(() => {
      throw new NotFoundException('missing');
    });

    const report = await service.getDailySummaryReport(
      'learner-1',
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T23:59:59.999Z',
      true,
    );

    expect(report.progress.rewards).toEqual({
      xp: 0,
      level: 1,
      xpToNextLevel: 0,
      currentLevelThreshold: 0,
      nextLevelThreshold: null,
      currentStreak: 0,
      lastActivityDate: null,
    });
  });

  it('throws for invalid date ranges', async () => {
    (analyticsService.getEventsByUserId as jest.Mock).mockResolvedValue([]);

    await expect(
      service.getDailySummaryReport(
        'learner-1',
        '2026-07-03T00:00:00.000Z',
        '2026-07-01T23:59:59.999Z',
        true,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
