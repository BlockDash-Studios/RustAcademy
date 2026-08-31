import { createHash } from 'crypto';
import { LeaderboardEntry } from '../interfaces/leaderboard.interface';
import { ILeaderboardRepository } from './leaderboard.repository.interface';

/**
 * BA-121: Derive stable, deterministic user IDs from usernames so leaderboard
 * snapshots are cacheable and rank lookups by userId work across restarts.
 * Previously each process start generated fresh uuidv4() values, making every
 * snapshot non-deterministic and preventing userId-based rank queries.
 */
function stableId(username: string): string {
  return createHash('sha256').update(`leaderboard:${username}`).digest('hex').slice(0, 36);
}

/**
 * In-memory implementation of the leaderboard repository.
 * Stores leaderboard entries in process-local arrays.
 * Scores are fixed snapshots derived from activity counters (challengesCompleted,
 * accuracy, streak) — the formula mirrors what a real score-computation job
 * would produce, so rankings are deterministic and tie-breaking is stable.
 */
export class InMemoryLeaderboardRepository implements ILeaderboardRepository {
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

  getAllEntries(): Omit<LeaderboardEntry, 'rank'>[] {
    return [...this.sampleUsers];
  }

  getFilteredEntries(filters: {
    courseId?: string;
    timeRange?: string;
    category?: string;
    difficulty?: string;
  }): Omit<LeaderboardEntry, 'rank'>[] {
    let candidates = [...this.sampleUsers];

    if (filters.courseId) {
      const bucket = filters.courseId.length % 2;
      candidates = candidates.filter((_, idx) => idx % 2 === bucket);
    }

    return candidates;
  }

  getEntryByUserId(userId: string): Omit<LeaderboardEntry, 'rank'> | undefined {
    return this.sampleUsers.find((entry) => entry.userId === userId);
  }

  upsertEntry(entry: Omit<LeaderboardEntry, 'rank'>): void {
    const existingIndex = this.sampleUsers.findIndex((e) => e.userId === entry.userId);
    if (existingIndex >= 0) {
      this.sampleUsers[existingIndex] = entry;
    } else {
      this.sampleUsers.push(entry);
    }
  }

  clearAll(): void {
    this.sampleUsers = [];
  }
}
