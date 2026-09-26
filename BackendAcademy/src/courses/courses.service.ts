import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

export type EnrollmentState = 'active' | 'withdrawn' | 'completed';
export interface Course {
  courseId: string;
  title: string;
  capacity: number;
  prerequisiteIds: string[];
}
export interface Enrollment {
  courseId: string;
  userId: string;
  state: EnrollmentState;
  updatedAt: string;
}
export interface TaskSubmission {
  courseId: string;
  taskId: string;
  userId: string;
  submissionId: string;
  submittedAt: string;
}

/** Course and enrollment rules. Storage follows the other BackendAcademy services. */
@Injectable()
export class CoursesService {
  private readonly courses = new Map<string, Course>();
  private readonly enrollments = new Map<string, Map<string, Enrollment>>();
  private readonly tasks = new Map<string, Set<string>>();
  private readonly submissions = new Map<string, TaskSubmission>();

  create(input: Omit<Course, 'prerequisiteIds'> & { prerequisiteIds?: string[] }): Course {
    if (this.courses.has(input.courseId)) throw new ConflictException('Course already exists');
    if (!Number.isInteger(input.capacity) || input.capacity < 1) {
      throw new BadRequestException('Capacity must be a positive integer');
    }
    const prerequisites = input.prerequisiteIds ?? [];
    if (new Set(prerequisites).size !== prerequisites.length || prerequisites.includes(input.courseId)) {
      throw new BadRequestException('Invalid prerequisites');
    }
    for (const prerequisiteId of prerequisites) this.get(prerequisiteId);
    const course = { ...input, prerequisiteIds: [...prerequisites] };
    this.courses.set(course.courseId, course);
    return course;
  }

  get(courseId: string): Course {
    const course = this.courses.get(courseId);
    if (!course) throw new NotFoundException(`Unknown course ${courseId}`);
    return course;
  }

  getEnrollment(courseId: string, userId: string): Enrollment | undefined {
    this.get(courseId);
    return this.enrollments.get(courseId)?.get(userId);
  }

  enroll(courseId: string, userId: string): Enrollment {
    const course = this.get(courseId);
    const byUser = this.enrollments.get(courseId) ?? new Map<string, Enrollment>();
    const current = byUser.get(userId);
    if (current?.state === 'active') throw new ConflictException('Already enrolled');
    if (current?.state === 'completed') throw new ConflictException('Course already completed');

    for (const prerequisiteId of course.prerequisiteIds) {
      if (this.getEnrollment(prerequisiteId, userId)?.state !== 'completed') {
        throw new BadRequestException(`Complete prerequisite ${prerequisiteId} first`);
      }
    }
    if ([...byUser.values()].filter((entry) => entry.state === 'active').length >= course.capacity) {
      throw new ConflictException('Course is full');
    }
    const enrollment: Enrollment = { courseId, userId, state: 'active', updatedAt: new Date().toISOString() };
    byUser.set(userId, enrollment);
    this.enrollments.set(courseId, byUser);
    return enrollment;
  }

  withdraw(courseId: string, userId: string): Enrollment {
    return this.transition(courseId, userId, 'withdrawn');
  }

  complete(courseId: string, userId: string): Enrollment {
    return this.transition(courseId, userId, 'completed');
  }

  private transition(courseId: string, userId: string, state: 'withdrawn' | 'completed'): Enrollment {
    const current = this.getEnrollment(courseId, userId);
    if (!current || current.state !== 'active') {
      throw new ConflictException(`Only active enrollments can become ${state}`);
    }
    const updated = { ...current, state, updatedAt: new Date().toISOString() };
    this.enrollments.get(courseId)!.set(userId, updated);
    return updated;
  }

  createTask(courseId: string, taskId: string) {
    this.get(courseId);
    const tasks = this.tasks.get(courseId) ?? new Set<string>();
    if (tasks.has(taskId)) throw new ConflictException('Task already exists');
    tasks.add(taskId);
    this.tasks.set(courseId, tasks);
    return { courseId, taskId };
  }

  submit(courseId: string, taskId: string, input: { userId: string; submissionId: string }): TaskSubmission {
    this.get(courseId);
    if (!this.tasks.get(courseId)?.has(taskId)) throw new NotFoundException(`Unknown task ${taskId}`);
    if (this.getEnrollment(courseId, input.userId)?.state !== 'active') {
      throw new BadRequestException('Active course enrollment required to submit a task');
    }
    if (this.submissions.has(input.submissionId)) throw new ConflictException('Submission already exists');
    const submission = { courseId, taskId, ...input, submittedAt: new Date().toISOString() };
    this.submissions.set(input.submissionId, submission);
    return submission;
  }
}
