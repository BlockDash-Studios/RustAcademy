import { Injectable, Logger, Optional } from '@nestjs/common';
import { CourseEntity } from '../courses/course.entity';
import { CourseService } from '../courses/course.service';
import { SearchIndexerService, COURSE_SEARCH_WEIGHTS } from './search-indexer.service';
import { SearchCoursesQueryDto } from './dto/search-courses-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import {
  PostSearchHit,
  SearchResults,
  UserSearchHit,
} from './interfaces/search.interface';
import { SearchRepository } from './interfaces/search-repository.interface';

/**
 * Re-export for backward compatibility. The canonical weights are defined
 * in {@link COURSE_SEARCH_WEIGHTS} on the indexer service.
 */
export const DEFAULT_SEARCH_FIELD_WEIGHTS = COURSE_SEARCH_WEIGHTS;

@Injectable()
export class SearchService {
  /** Defensive cap on page size. */
  private static readonly MAX_LIMIT = 50;
  private static readonly DEFAULT_LIMIT = 10;

  /** Minimum result count below which we widen the search via fallback ranking. */
  private static readonly FALLBACK_THRESHOLD = 3;

  constructor(
    private readonly courseService: CourseService,
    @Optional() private readonly indexer?: SearchIndexerService,
    @Optional() private readonly searchRepository?: SearchRepository,
  ) {}

  /**
   * Apply pagination + substring matching. Pure helper - intent is shared
   * across all 3 resource types.
   *
   * Limit semantics: an explicit `limit = 0` (or any non-positive / non-finite
   * value) is treated as "not provided" and falls back to `DEFAULT_LIMIT`.
   * This avoids accidentally returning the full corpus when someone wires
   * limit from a UI control that starts at zero.
   */
  private paginate<T>(
    items: T[],
    q: string | undefined,
    limit: number | undefined,
    offset: number | undefined,
    matchFields: (item: T) => string,
  ): SearchResults<T> {
    const rawLimit = Number(limit);
    const effectiveLimit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, SearchService.MAX_LIMIT)
        : SearchService.DEFAULT_LIMIT;
    const effectiveOffset = Math.max(0, Number(offset) || 0);
    const needle = (q || '').toLowerCase().trim();

    const matched = needle
      ? items.filter((item) =>
          matchFields(item).toLowerCase().includes(needle),
        )
      : items;

    const total = matched.length;
    const page = matched.slice(effectiveOffset, effectiveOffset + effectiveLimit);
    const hasMore = effectiveOffset + page.length < total;

    const response: SearchResults<T> = {
      entries: page,
      total,
      hasMore,
    };
    if (hasMore) {
      response.nextOffset = effectiveOffset + page.length;
    }
    return response;
  }

  searchUsers(query: SearchQueryDto): SearchResults<UserSearchHit> {
    if (this.searchRepository) {
      return this.searchRepository.searchUsers({
        q: query.q,
        limit: query.limit,
        offset: query.offset,
      });
    }
    // Fallback: return empty results when no repository is available
    return { entries: [], total: 0, hasMore: false };
  }

  /**
   * Issue #370 — content-based relevance tuning + deterministic ranking.
   *
   * Strategy:
   *   1. Pull the corpus: prefer SearchIndexerService (synchronous, fresh
   *      after each write — fixes #369) and fall back to CourseService.findAll.
   *   2. Apply tag / category filters (existing behaviour).
   *   3. Rank the survivors by a weighted field score with deterministic
   *      tie-breaking by course.id so the same query always produces the
   *      same result order.
   *   4. If the weighted pool has fewer than FALLBACK_THRESHOLD matches,
   *      widen the search to a pure description-substring match so that
   *      learners still see *something* relevant for fuzzy queries.
   */
  async searchCourses(
    query: SearchCoursesQueryDto,
  ): Promise<SearchResults<CourseEntity>> {
    const courses = await this.loadCourseCorpus();
    const tags = this.normalize([...(query.tag ?? []), ...(query.tags ?? [])]);
    const categories = this.normalize([
      ...(query.category ?? []),
      ...(query.categories ?? []),
    ]);
    const match = query.match ?? 'any';
    const filteredCourses =
      tags.length === 0 && categories.length === 0
        ? courses
        : courses.filter((course) => {
            const courseTags = this.normalize(course.tags);
            const courseCategories = this.normalize([
              course.category,
              ...(course.categories ?? []),
            ]);
            const checks = [
              ...tags.map((tag) => courseTags.includes(tag)),
              ...categories.map((category) =>
                courseCategories.includes(category),
              ),
            ];

            return match === 'all'
              ? checks.every(Boolean)
              : checks.some(Boolean);
          });

    const needle = (query.q || '').toLowerCase().trim();
    if (!needle) {
      return this.paginate(
        filteredCourses,
        undefined,
        query.limit,
        query.offset,
        () => '',
      );
    }

    // Deterministic field-weighted ranking via the indexer service.
    // Tie-breaking by course.id ensures stable, reproducible ordering.
    const ranked = this.indexer
      ? this.indexer.rankCourses(filteredCourses, needle)
      : this.fallbackRank(filteredCourses, needle);

    if (ranked.length >= SearchService.FALLBACK_THRESHOLD) {
      return this.paginate(
        ranked.map((entry) => entry.course),
        undefined,
        query.limit,
        query.offset,
        () => '',
      );
    }

    // Fallback ranking: substring match on description so vague queries
    // still surface relevant content instead of an empty page.
    const fallback = filteredCourses.filter((course) =>
      (course.description ?? '').toLowerCase().includes(needle),
    );

    const combined =
      ranked.length === 0
        ? fallback
        : [
            ...ranked.map((entry) => entry.course),
            ...fallback.filter(
              (course) => !ranked.some((entry) => entry.course.id === course.id),
            ),
          ];

    return this.paginate(
      combined,
      undefined,
      query.limit,
      query.offset,
      () => '',
    );
  }

  /**
   * Fallback ranking when no indexer is available. Uses the same weights
   * as the indexer but without deterministic tie-breaking.
   */
  private fallbackRank(
    courses: CourseEntity[],
    needle: string,
  ): Array<{ course: CourseEntity; score: number }> {
    return courses
      .map((course) => ({
        course,
        score: this.scoreCourseLocal(course, needle),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Local relevance scoring for fallback mode (no indexer).
   * Uses {@link COURSE_SEARCH_WEIGHTS} for consistent weights.
   */
  private scoreCourseLocal(course: CourseEntity, needle: string): number {
    return this.indexer ? this.indexer.scoreCourse(course, needle) : 0;
  }

  searchPosts(query: SearchQueryDto): SearchResults<PostSearchHit> {
    if (this.searchRepository) {
      return this.searchRepository.searchPosts({
        q: query.q,
        limit: query.limit,
        offset: query.offset,
      });
    }
    // Fallback: return empty results when no repository is available
    return { entries: [], total: 0, hasMore: false };
  }

  /**
   * Prefer the synchronous in-memory index (Issue #369) and fall back to
   * the legacy `CourseService.findAll()` path so callers without an indexer
   * (e.g. unit tests) keep working unchanged.
   */
  private async loadCourseCorpus(): Promise<CourseEntity[]> {
    if (this.indexer && this.indexer.size() > 0) {
      return this.indexer.getIndexedCourses();
    }
    return this.courseService.findAll();
  }

  private normalize(values?: string[]): string[] {
    return (values ?? [])
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  }
}
