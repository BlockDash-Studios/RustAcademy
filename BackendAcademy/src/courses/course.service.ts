import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCourseDto } from './dto/create-course.dto';
import { Course } from './course.types';

/**
 * Manages the course catalogue (BE-041).
 *
 * In-memory, matching the pattern used by XpService, FollowService, etc.
 * Each course carries a `prerequisiteCourseIds` list that EnrollmentService
 * reads to enforce the prerequisite chain before allowing enrollment.
 */
@Injectable()
export class CourseService {
  private readonly courses = new Map<string, Course>();

  create(dto: CreateCourseDto): Course {
    if (this.courses.has(dto.courseId)) {
      throw new BadRequestException(`Course "${dto.courseId}" already exists`);
    }

    const course: Course = {
      courseId: dto.courseId,
      title: dto.title,
      description: dto.description,
      prerequisiteCourseIds: dto.prerequisiteCourseIds ?? [],
      createdAt: new Date().toISOString(),
    };

    this.courses.set(course.courseId, course);
    return course;
  }

  findById(courseId: string): Course {
    const course = this.courses.get(courseId);
    if (!course) throw new NotFoundException(`Course "${courseId}" not found`);
    return course;
  }

  findAll(): Course[] {
    return [...this.courses.values()];
  }

  exists(courseId: string): boolean {
    return this.courses.has(courseId);
  }
}
