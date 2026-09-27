import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { Lesson } from './course.types';

/**
 * Manages lessons within a course (BE-041).
 *
 * Each lesson carries `prerequisiteLessonIds` that EnrollmentService reads
 * when a learner attempts to start a lesson, enforcing the lesson-level
 * prerequisite chain.
 */
@Injectable()
export class LessonService {
  private readonly lessons = new Map<string, Lesson>();

  create(dto: CreateLessonDto): Lesson {
    if (this.lessons.has(dto.lessonId)) {
      throw new BadRequestException(`Lesson "${dto.lessonId}" already exists`);
    }

    const lesson: Lesson = {
      lessonId: dto.lessonId,
      courseId: dto.courseId,
      title: dto.title,
      order: dto.order,
      prerequisiteLessonIds: dto.prerequisiteLessonIds ?? [],
      createdAt: new Date().toISOString(),
    };

    this.lessons.set(lesson.lessonId, lesson);
    return lesson;
  }

  findById(lessonId: string): Lesson {
    const lesson = this.lessons.get(lessonId);
    if (!lesson) throw new NotFoundException(`Lesson "${lessonId}" not found`);
    return lesson;
  }

  findByCourse(courseId: string): Lesson[] {
    return [...this.lessons.values()]
      .filter((l) => l.courseId === courseId)
      .sort((a, b) => a.order - b.order);
  }

  exists(lessonId: string): boolean {
    return this.lessons.has(lessonId);
  }
}
