import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { GetLeaderboardDto } from './dto/get-leaderboard.dto';
import { LeaderboardEntry, LeaderboardResponse } from './interfaces/leaderboard.interface';

/** BA-121: stable deterministic ID derived from username — survives restarts */
function stableId(username: string): string {
  return createHash('sha256').update(`leaderboard:${username}`).digest('hex').slice(0, 36);
}

@Injectable()
export class LeaderboardService {
  // BA-121: IDs are now deterministic (SHA-256 of username) so snapshots are
  // cacheable and userId-based rank queries work across process restarts.
  private sampleUsers: Omit<LeaderboardEntry, 'rank'>[] = [
    {
      userId: stableId('rustmaster'),
      username: 'rustmaster',
      avatarUrl: 'https://example.com/avatars/rustmaster.png',
      score: 15420,
      challengesCompleted: 127,
      accuracy: 94.5,
      streak: 45,
    },
    {
      userId: stableId('codewarrior'),
      username: 'codewarrior',
      avatarUrl: 'https://example.com/avatars/codewarrior.png',
      score: 14890,
      challengesCompleted: 118,
      accuracy: 92.3,
      streak: 32,
    },
    {
      userId: stableId('memorieslock'),
      username: 'memorieslock',
      avatarUrl: 'https://example.com/avatars/memorieslock.png',
      score: 14250,
      challengesCompleted: 112,
      accuracy: 91.8,
      streak: 28,
    },
    {
      userId: stableId('rustacean'),
      username: 'rustacean',
      avatarUrl: 'https://example.com/avatars/rustacean.png',
      score: 13780,
      challengesCompleted: 105,
      accuracy: 89.7,
      streak: 21,
    },
    {
      userId: stableId('systemshade'),
      username: 'systemshade',
      avatarUrl: 'https://example.com/avatars/systemshade.png',
      score: 13150,
      challengesCompleted: 98,
      accuracy: 88.2,
      streak: 18,
    },
    {
      userId: stableId('codelover'),
      username: 'codelover',
      avatarUrl: 'https://example.com/avatars/codelover.png',
      score: 12890,
      challengesCompleted: 92,
      accuracy: 87.5,
      streak: 15,
    },
    {
      userId: stableId('learningdev'),
      username: 'learningdev',
      avatarUrl: 'https://example.com/avatars/learningdev.png',
      score: 11560,
      challengesCompleted: 85,
      accuracy: 85.3,
      streak: 12,
    },
    {
      userId: stableId('newbiecoder'),
      username: 'newbiecoder',
      avatarUrl: 'https://example.com/avatars/newbiecoder.png',
      score: 9870,
      challengesCompleted: 67,
      accuracy: 82.1,
      streak: 8,
    },
  ];

  async getLeaderboard(getLeaderboardDto: GetLeaderboardDto): Promise<LeaderboardResponse> {
    const {
      timeRange = 'allTime',
      category,
      difficulty,
      scope,
      courseId,
      limit = 10,
      offset = 0,
      userId,
    } = getLeaderboardDto;

    // scope=`weekly` is currently a NO-OP filter: it pins `effectiveTimeRange`
    // to 'weekly' only when the caller didn't supply an explicit timeRange
    // (so timeRange wins if both are passed). The underlying sample data is
    // NOT bucketed by date - this is a stub marker only.
    // TODO: when LeaderboardsRepository lands, scope='weekly' should filter to
    // entries with activity inside the rolling 7-day window.
    const effectiveTimeRange = scope === 'weekly' && !timeRange ? 'weekly' : timeRange;

    // scope=`course` returns only entries that belong to the requested course.
    // NOTE: this is a stub backed by the in-memory sample set whose userIds are
    // randomized `uuidv4()` values. We can't join a real CourseMembership table
    // until IDs become stable, so we use a deterministic-but-arbitrary split:
    // bucket = courseId.length % 2 -> every other entry by index.
    // TODO: replace with a CourseRepository.findByUserId lookup.
    // courseId sensitivity: the bucketing changes with courseId *length*, so
    // `course-1` and `course-12` will return different subsets - intentional
    // stub behavior, will be removed when the real lookup lands.
    let candidates = [...this.sampleUsers];
    if (scope === 'course' && courseId) {
      const bucket = courseId.length % 2;
      candidates = candidates.filter((_, idx) => idx % 2 === bucket);
    }
    if (scope === 'course' && !courseId) {
      // course scope requires a courseId - return nothing rather than guess.
      candidates = [];
    }

    // TODO: wire timeRange/category/difficulty against a real LeaderboardsRepository.
    const sortedEntries = [...candidates]
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    const paginatedEntries = sortedEntries.slice(offset, offset + limit);
    const total = sortedEntries.length;
    const hasMore = offset + limit < total;

    let userRank: LeaderboardEntry | undefined;
    if (userId) {
      userRank = sortedEntries.find((entry) => entry.userId === userId);
    }

    return {
      entries: paginatedEntries,
      total,
      hasMore,
      filters: {
        timeRange: effectiveTimeRange,
        category,
        difficulty,
        scope,
        courseId,
        limit,
        offset,
      },
      userRank,
    };
  }
}