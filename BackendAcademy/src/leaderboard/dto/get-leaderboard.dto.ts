export type LeaderboardScope = 'global' | 'weekly' | 'course';

export class GetLeaderboardDto {
  timeRange?: 'daily' | 'weekly' | 'monthly' | 'allTime';
  category?: string;
  difficulty?: string;
  /**
   * High-level leaderboard grouping.
   * - `global` (default): cross-course, ordered by overall score.
   * - `weekly`: pins `effectiveTimeRange=weekly` when no timeRange is set.
   *   (Currently a no-op against the sample data - see service TODO.)
   * - `course`: requires `courseId`; returns only entries in that course.
   */
  scope?: LeaderboardScope;
  /**
   * Required when scope=`course`. Filters leaderboard to a single course.
   * NOTE: this field is currently a stub identifier; the real
   * implementation should join a course-membership repository.
   *
   * Precedence with `timeRange`: if both `scope='weekly'` and an explicit
   * `timeRange` are supplied, `timeRange` wins for the resolved time bucket
   * reported back to the client.
   *
   * NOTE: this DTO does not declare `class-validator` decorators - consistent
   * with other DTOs in the project. Out-of-range `scope` values will therefore
   * pass through to the service as strings.
   */
  courseId?: string;
  limit?: number;
  offset?: number;
  userId?: string;
}