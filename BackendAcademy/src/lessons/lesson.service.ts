import { Injectable, NotFoundException } from '@nestjs/common';
import { LessonEntity } from './lesson.entity';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Injectable()
export class LessonService {
  private readonly lessons: Map<string, LessonEntity> = new Map();

  async create(dto: CreateLessonDto): Promise<LessonEntity> {
    const lesson = new LessonEntity({
      id: crypto.randomUUID(),
      ...dto,
    });
    this.lessons.set(lesson.id, lesson);
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
    return lesson;
  }

  async remove(id: string): Promise<boolean> {
    return this.lessons.delete(id);
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