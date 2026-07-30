import { LeaderboardEntry } from '../interfaces/leaderboard.interface';

export type CompetitionStatus = 'scheduled' | 'active' | 'ended' | 'reset';
export type CompetitionScope = 'global' | 'weekly' | 'course';

/**
 * A time-boxed competition event. `startsAt`/`endsAt` define the window in
 * which activity counts toward the competition's live leaderboard.
 */
export interface CompetitionEvent {
  id: string;
  name: string;
  scope: CompetitionScope;
  courseId?: string;
  startsAt: Date;
  endsAt: Date;
  status: CompetitionStatus;
  createdAt: Date;
  resetAt?: Date;
  resetCount: number;
}

export type CompetitionSnapshotEntry = LeaderboardEntry;

/**
 * Archived standings captured at the moment a competition is reset.
 * Used to power summary exports even after live entries are cleared.
 */
export interface CompetitionResetRecord {
  competitionId: string;
  resetAt: Date;
  archivedEntries: CompetitionSnapshotEntry[];
  participantCount: number;
}

export interface CompetitionLeaderboardResponse {
  competition: CompetitionEvent;
  entries: CompetitionSnapshotEntry[];
  total: number;
  hasMore: boolean;
}

/**
 * Point-in-time exportable summary of a competition's standings and
 * lifecycle, suitable for download or inclusion in a reports payload.
 */
export interface CompetitionSummaryExport {
  competitionId: string;
  name: string;
  scope: CompetitionScope;
  courseId?: string;
  window: { startsAt: string; endsAt: string };
  status: CompetitionStatus;
  generatedAt: string;
  totalParticipants: number;
  totalResets: number;
  topEntries: CompetitionSnapshotEntry[];
}
