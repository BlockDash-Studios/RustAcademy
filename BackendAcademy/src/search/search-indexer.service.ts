import { Injectable, Logger } from '@nestjs/common';
import { CourseEntity } from '../courses/course.entity';

/**
 * Field-weight configuration for course relevance scoring.
 *
 * These weights control how much each field contributes to the
 * relevance score when ranking search results. Higher weights
 * mean the field has more influence on ranking.
 *
 * Field weights are intentionally exposed as a configurable static block
 * so this module stays self-contained. Adjust the weights here
 * when tuning search quality.
 */
export const COURSE_SEARCH_WEIGHTS = {
  /** Title matches rank highest — the most semantically relevant signal. */
  title: 3,
  /** Tag matches signal topic alignment. */
  tags: 2,
  /** Description matches provide breadth but lower specificity. */
  description: 1,
  /** Category matches provide broad context. */
  categories: 0.5,
  category: 0.5,
} as const;

/**
 * SearchIndexerService (Issue #369)
 *
 * Maintains a synchronous in-memory course index so that search results
 * reflect the latest write immediately, instead of lagging by several
 * minutes behind content updates.
 *
 * The index is consulted by SearchService.searchCourses when present, and
 * falls back to CourseService.findAll() otherwise (so existing call paths
 * keep working). CourseService and LessonService notify the indexer
 * synchronously from their create/update/restore/remove paths so the
 * "search shows stale content" bug cannot occur.
 *
 * ## Refresh behavior
 *
 * - **Write-through**: Every course create/update/restore/remove triggers
 *   an immediate synchronous upsert or delete on the index.
 * - **Bulk reindex**: `reindexAll()` atomically replaces the entire index.
 *   Used by periodic consistency checks and admin-triggered refreshes.
 *   The caller should pass the full course corpus from the source of truth
 *   (e.g., `CourseService.findAll()`).
 *
 * ## Deterministic relevance
 *
 * Ranking uses a two-level tie-breaker to ensure stable, reproducible
 * ordering:
 *   1. Weighted field score (title > tags > description > categories)
 *   2. Lexicographic sort by `course.id` for courses with identical scores
 *
 * This means the same query always returns results in the same order,
 * regardless of the order the courses were indexed.
 */
@Injectable()
export class SearchIndexerService {
  private readonly logger = new Logger(SearchIndexerService.name);
  private readonly indexedCourses = new Map<string, CourseEntity>();

  /** Timestamp of the last full reindex operation. */
  private lastReindexAt: Date | null = null;

  /**
   * Idempotently upserts a course into the in-memory index. Called from
   * CourseService.create / update / restoreRevision immediately after the
   * write completes so subsequent reads see the freshest snapshot.
   */
  indexCourse(course: CourseEntity): void {
    if (!course || !course.id) {
      return;
    }
    this.indexedCourses.set(course.id, course);
    this.logger.debug(`Indexed course ${course.id} (v${course.version})`);
  }

  /**
   * Removes a course from the in-memory index. Called from
   * CourseService.remove so search results never return a deleted course.
   */
  removeCourse(courseId: string): void {
    if (this.indexedCourses.delete(courseId)) {
      this.logger.debug(`Removed course ${courseId} from search index`);
    }
  }

  /**
   * Bulk reindex. Used by JobsService when periodic consistency checks
   * detect a divergence between the source of truth and the in-memory
   * index.
   *
   * @returns The number of courses indexed.
   */
  reindexAll(courses: CourseEntity[]): number {
    this.indexedCourses.clear();
    for (const course of courses) {
      if (course && course.id) {
        this.indexedCourses.set(course.id, course);
      }
    }
    this.lastReindexAt = new Date();
    this.logger.log(`Reindexed ${this.indexedCourses.size} courses`);
    return this.indexedCourses.size;
  }

  /**
   * Returns a snapshot of the indexed courses. Always returns a fresh
   * array so callers cannot mutate the internal map.
   */
  getIndexedCourses(): CourseEntity[] {
    return Array.from(this.indexedCourses.values());
  }

  /**
   * Compute a weighted relevance score for a course against a query needle.
   * Higher score = better match. Returns 0 when nothing matches.
   *
   * Uses {@link COURSE_SEARCH_WEIGHTS} for field weighting.
   */
  scoreCourse(course: CourseEntity, needle: string): number {
    const weights = COURSE_SEARCH_WEIGHTS;
    let score = 0;

    if ((course.title ?? '').toLowerCase().includes(needle)) {
      score += weights.title;
    }
    if ((course.description ?? '').toLowerCase().includes(needle)) {
      score += weights.description;
    }
    if ((course.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))) {
      score += weights.tags;
    }
    const categories = [
      course.category,
      ...(course.categories ?? []),
    ]
      .filter(Boolean)
      .map((value) => value.toLowerCase());
    if (categories.some((category) => category.includes(needle))) {
      score += weights.categories;
    }

    return score;
  }

  /**
   * Rank and sort a list of courses by relevance to a query needle.
   * Uses deterministic tie-breaking (by course.id) so the same query
   * always returns results in the same order.
   *
   * @returns Sorted array of { course, score } with highest score first.
   */
  rankCourses(
    courses: CourseEntity[],
    needle: string,
  ): Array<{ course: CourseEntity; score: number }> {
    return courses
      .map((course) => ({
        course,
        score: this.scoreCourse(course, needle),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        // Primary: score descending
        if (b.score !== a.score) return b.score - a.score;
        // Tie-breaker: lexicographic by id for deterministic ordering
        return a.course.id.localeCompare(b.course.id);
      });
  }

  /**
   * Returns the indexed size — handy for tests and admin diagnostics.
   */
  size(): number {
    return this.indexedCourses.size;
  }

  /**
   * Returns the timestamp of the last full reindex operation,
   * or null if no reindex has been performed yet.
   */
  getLastReindexAt(): Date | null {
    return this.lastReindexAt;
  }
}
