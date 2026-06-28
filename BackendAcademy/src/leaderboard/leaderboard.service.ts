import { Injectable } from '@nestjs/common';
import { GetLeaderboardDto } from './dto/get-leaderboard.dto';
import { LeaderboardEntry, LeaderboardResponse } from './interfaces/leaderboard.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LeaderboardService {
  // Sample leaderboard data - in a real implementation, this would come from a database
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

  async getLeaderboard(getLeaderboardDto: GetLeaderboardDto): Promise<LeaderboardResponse> {
    const { timeRange = 'allTime', category, difficulty, limit = 10, offset = 0, userId } = getLeaderboardDto;
    
    // In a real implementation, we would filter based on timeRange, category, and difficulty
    // For now, we'll return all sample data sorted by score
    let sortedEntries = [...this.sampleUsers]
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    // Apply pagination
    const paginatedEntries = sortedEntries.slice(offset, offset + limit);
    const total = sortedEntries.length;
    const hasMore = offset + limit < total;

    // Find current user's rank if userId is provided
    let userRank: LeaderboardEntry | undefined;
    if (userId) {
      userRank = sortedEntries.find(entry => entry.userId === userId);
    }

    return {
      entries: paginatedEntries,
      total,
      hasMore,
      filters: {
        timeRange,
        category,
        difficulty,
        limit,
        offset,
      },
      userRank,
    };
  }
}