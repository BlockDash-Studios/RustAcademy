import { Injectable, Logger } from '@nestjs/common';
import { CourseEntity } from '../courses/course.entity';

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
 */
@Injectable()
export class SearchIndexerService {
  private readonly logger = new Logger(SearchIndexerService.name);
  private readonly indexedCourses = new Map<string, CourseEntity>();

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
   */
  reindexAll(courses: CourseEntity[]): number {
    this.indexedCourses.clear();
    for (const course of courses) {
      if (course && course.id) {
        this.indexedCourses.set(course.id, course);
      }
    }
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
   * Returns the indexed size — handy for tests and admin diagnostics.
   */
  size(): number {
    return this.indexedCourses.size;
  }
}
