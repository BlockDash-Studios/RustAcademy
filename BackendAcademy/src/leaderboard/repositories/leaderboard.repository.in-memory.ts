import { LeaderboardEntry } from '../interfaces/leaderboard.interface';
import { ILeaderboardRepository } from './leaderboard.repository.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * In-memory implementation of the leaderboard repository.
 * Stores leaderboard entries in process-local arrays.
 */
export class InMemoryLeaderboardRepository implements ILeaderboardRepository {
  private sampleUsers: Omit<LeaderboardEntry, 'rank'>[] = [
    {
      userId: uuidv4(),
      username: 'rustmaster',
      avatarUrl: 'https://example.com/avatars/rustmaster.png',
      score: 15420,
      challengesCompleted: 127,
      accuracy: 94.5,
      streak: 45,
    },
    {
      userId: uuidv4(),
      username: 'codewarrior',
      avatarUrl: 'https://example.com/avatars/codewarrior.png',
      score: 14890,
      challengesCompleted: 118,
      accuracy: 92.3,
      streak: 32,
    },
    {
      userId: uuidv4(),
      username: 'memorieslock',
      avatarUrl: 'https://example.com/avatars/memorieslock.png',
      score: 14250,
      challengesCompleted: 112,
      accuracy: 91.8,
      streak: 28,
    },
    {
      userId: uuidv4(),
      username: 'rustacean',
      avatarUrl: 'https://example.com/avatars/rustacean.png',
      score: 13780,
      challengesCompleted: 105,
      accuracy: 89.7,
      streak: 21,
    },
    {
      userId: uuidv4(),
      username: 'systemshade',
      avatarUrl: 'https://example.com/avatars/systemshade.png',
      score: 13150,
      challengesCompleted: 98,
      accuracy: 88.2,
      streak: 18,
    },
    {
      userId: uuidv4(),
      username: 'codelover',
      avatarUrl: 'https://example.com/avatars/codelover.png',
      score: 12890,
      challengesCompleted: 92,
      accuracy: 87.5,
      streak: 15,
    },
    {
      userId: uuidv4(),
      username: 'learningdev',
      avatarUrl: 'https://example.com/avatars/learningdev.png',
      score: 11560,
      challengesCompleted: 85,
      accuracy: 85.3,
      streak: 12,
    },
    {
      userId: uuidv4(),
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

    // Course scope filtering (same logic as original service)
    if (filters.courseId) {
      const bucket = filters.courseId.length % 2;
      candidates = candidates.filter((_, idx) => idx % 2 === bucket);
    }

    // Note: timeRange, category, and difficulty filters are stubs
    // These would be implemented when real data is available

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
