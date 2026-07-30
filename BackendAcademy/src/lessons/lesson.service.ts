import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { LessonEntity } from './lesson.entity';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { SearchIndexerService } from '../search/search-indexer.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class LessonService {
  private readonly logger = new Logger(LessonService.name);
  private readonly lessons: Map<string, LessonEntity> = new Map();

  constructor(
    @Optional() private readonly searchIndexer?: SearchIndexerService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async create(dto: CreateLessonDto): Promise<LessonEntity> {
    const lesson = new LessonEntity({
      id: crypto.randomUUID(),
      ...dto,
    });
    this.lessons.set(lesson.id, lesson);
    // #379: a freshly created lesson invalidates any cached lookups for it
    await this.redisService?.invalidateContentCache('lesson', lesson.id);
    return lesson;
  }

  async findAll(): Promise<LessonEntity[]> {
    return Array.from(this.lessons.values());
  }

  async findByCourseId(courseId: string): Promise<LessonEntity[]> {
    return Array.from(this.lessons.values())
      .filter((l) => l.courseId === courseId)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Same as findByCourseId, but only returns lessons that are safe to show
   * learners: published, and carrying a valid version number. This is what
   * course-navigation endpoints should call instead of findByCourseId, so a
   * broken/incomplete lesson never shows up in the nav list.
   */
  async findPublishedByCourseId(courseId: string): Promise<LessonEntity[]> {
    return (await this.findByCourseId(courseId)).filter((l) =>
      this.isServeable(l),
    );
  }

  async findById(id: string): Promise<LessonEntity | null> {
    return this.lessons.get(id) || null;
  }

  /**
   * Fetches a lesson for learner consumption. Throws a structured
   * NotFoundException (rather than returning null/undefined or letting a
   * downstream consumer dereference a missing field) whenever the lesson
   * doesn't exist, has no version, or isn't published. This is the
   * boundary that used to leak raw server errors to the frontend.
   */
  async findServeableById(id: string): Promise<LessonEntity> {
    const lesson = this.lessons.get(id);

    if (!lesson) {
      throw new NotFoundException({
        error: 'LESSON_NOT_FOUND',
        message: `Lesson with ID ${id} not found`,
      });
    }

    if (!this.isServeable(lesson)) {
      throw new NotFoundException({
        error: 'LESSON_UNAVAILABLE',
        message: `Lesson ${id} is missing a version or is unpublished`,
      });
    }

    return lesson;
  }

  async update(
    id: string,
    dto: UpdateLessonDto,
  ): Promise<LessonEntity | null> {
    const lesson = this.lessons.get(id);
    if (!lesson) return null;
    Object.assign(lesson, dto, { updatedAt: new Date() });
    // #379: edits to lesson content must invalidate any cached lookups for it
    // and for the parent course. Search index updates for lessons flow through
    // their owning course (see #369 — SearchIndexerService indexes courses,
    // not lessons directly).
    await this.redisService?.invalidateContentCache('lesson', id);
    if (lesson.courseId) {
      await this.redisService?.invalidateContentCache('course', lesson.courseId);
    }
    return lesson;
  }

  async remove(id: string): Promise<boolean> {
    const lesson = this.lessons.get(id);
    const deleted = this.lessons.delete(id);
    if (deleted && lesson) {
      // #369: lesson removal also invalidates the parent course's cache
      await this.redisService?.invalidateContentCache('lesson', id);
      if (lesson.courseId) {
        await this.redisService?.invalidateContentCache('course', lesson.courseId);
      }
    }
    return deleted;
  }

  /**
   * A lesson is safe to serve to a learner only if it has a valid version
   * number and is explicitly published. Missing/undefined version or
   * isPublished previously fell through as "truthy enough" and surfaced as
   * a downstream crash or blank navigation entry instead of a clean 404.
   */
  private isServeable(lesson: LessonEntity): boolean {
    return (
      Number.isFinite(lesson.version) &&
      lesson.version >= 1 &&
      lesson.isPublished === true
    );
  }
}
