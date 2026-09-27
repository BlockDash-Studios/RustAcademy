import { BadRequestException, Injectable } from "@nestjs/common";

/**
 * Course draft/publish lifecycle validation (BE-077).
 *
 * Backs the course builder's publish action: a course must have at least
 * one lesson and at least one task somewhere across its sections before it
 * can move out of "draft" and become visible in the catalog. This module
 * is deliberately independent of the (not yet implemented) course entity —
 * it operates on a minimal shape so it can be wired into whichever
 * persistence layer the course builder module ends up using.
 */

export type CourseLifecycleStatus = "draft" | "published";

export interface CourseSectionSummary {
  lessonCount: number;
  taskCount: number;
}

export interface CoursePublishInput {
  id: string;
  status: CourseLifecycleStatus;
  sections: CourseSectionSummary[];
}

export const MIN_LESSONS_TO_PUBLISH = 1;
export const MIN_TASKS_TO_PUBLISH = 1;

@Injectable()
export class CoursePublishValidator {
  /** Total lessons across every section of the course. */
  private totalLessons(course: CoursePublishInput): number {
    return course.sections.reduce((sum, s) => sum + s.lessonCount, 0);
  }

  /** Total tasks across every section of the course. */
  private totalTasks(course: CoursePublishInput): number {
    return course.sections.reduce((sum, s) => sum + s.taskCount, 0);
  }

  /**
   * True when the course has enough content to publish: at least
   * MIN_LESSONS_TO_PUBLISH lesson(s) and MIN_TASKS_TO_PUBLISH task(s) in
   * total across its sections.
   */
  hasMinimumContent(course: CoursePublishInput): boolean {
    return (
      this.totalLessons(course) >= MIN_LESSONS_TO_PUBLISH &&
      this.totalTasks(course) >= MIN_TASKS_TO_PUBLISH
    );
  }

  /**
   * Validates that `course` may transition draft → published.
   * Throws BadRequestException (400) with a clear reason if it can't yet.
   */
  assertCanPublish(course: CoursePublishInput): void {
    const lessons = this.totalLessons(course);
    const tasks = this.totalTasks(course);

    if (lessons < MIN_LESSONS_TO_PUBLISH || tasks < MIN_TASKS_TO_PUBLISH) {
      throw new BadRequestException({
        error:
          `Course cannot be published: requires at least ${MIN_LESSONS_TO_PUBLISH} lesson(s) ` +
          `and ${MIN_TASKS_TO_PUBLISH} task(s) (has ${lessons} lesson(s), ${tasks} task(s))`,
        code: "INSUFFICIENT_CONTENT_TO_PUBLISH",
      });
    }
  }

  /**
   * True when the course should be visible in the public catalog.
   * Drafts (including ones that already meet the content minimum but
   * haven't been explicitly published) stay hidden.
   */
  isVisibleInCatalog(course: Pick<CoursePublishInput, "status">): boolean {
    return course.status === "published";
  }
}
