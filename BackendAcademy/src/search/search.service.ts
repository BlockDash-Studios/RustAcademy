import { Injectable, Optional } from '@nestjs/common';
import { CourseEntity } from '../courses/course.entity';
import { CourseService } from '../courses/course.service';
import { SearchIndexerService } from './search-indexer.service';
import { SearchCoursesQueryDto } from './dto/search-courses-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import {
  PostSearchHit,
  SearchResults,
  UserSearchHit,
} from './interfaces/search.interface';
import { SearchRepository } from './interfaces/search-repository.interface';

/**
 * Default field-weight configuration for course relevance (Issue #370).
 *
 * Field weights are intentionally exposed as a configurable static block
 * (not pulled from env.schema.ts) so this module stays self-contained
 * even when the env schema is being refactored. Adjust the weights here
 * when tuning search quality.
 */
export const DEFAULT_SEARCH_FIELD_WEIGHTS = {
  title: 3,
  description: 1,
  tags: 2,
  categories: 0.5,
  category: 0.5,
} as const;

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
   * Issue #370 — content-based relevance tuning + fallback ranking.
   *
   * Strategy:
   *   1. Pull the corpus: prefer SearchIndexerService (synchronous, fresh
   *      after each write — fixes #369) and fall back to CourseService.findAll.
   *   2. Apply tag / category filters (existing behaviour).
   *   3. Rank the survivors by a weighted field score so an exact title hit
   *      outranks a description hit. Without `q`, this is a no-op.
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

    // Field-weighted ranking on the survivors.
    const weighted = filteredCourses
      .map((course) => ({
        course,
        score: this.scoreCourse(course, needle),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (weighted.length >= SearchService.FALLBACK_THRESHOLD) {
      return this.paginate(
        weighted.map((entry) => entry.course),
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
      weighted.length === 0
        ? fallback
        : [
            ...weighted.map((entry) => entry.course),
            ...fallback.filter(
              (course) => !weighted.some((entry) => entry.course.id === course.id),
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
   * Compute a weighted relevance score for a course against a query needle.
   * Higher score = better match. Returns 0 when nothing matches.
   */
  private scoreCourse(course: CourseEntity, needle: string): number {
    const weights = DEFAULT_SEARCH_FIELD_WEIGHTS;
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
