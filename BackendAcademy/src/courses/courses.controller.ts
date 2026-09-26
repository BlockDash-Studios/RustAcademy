import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CourseService } from './course.service';
import { EnrollmentService } from './enrollment.service';
import { LessonService } from './lesson.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { EnrollDto } from './dto/enroll.dto';
import { StartLessonDto } from './dto/start-lesson.dto';
import { CompleteLessonDto } from './dto/complete-lesson.dto';
import { CompleteCourseDto } from './dto/complete-course.dto';

/**
 * REST surface for the Learning Academy — courses, lessons, and enrollment.
 *
 * Base path: /api/v1/courses
 *
 * Prerequisite enforcement sits entirely in EnrollmentService. This controller
 * is intentionally thin — it delegates all logic and lets NestJS's global
 * exception filter turn service exceptions into the right HTTP status codes:
 *
 *   ConflictException  (409) → prerequisites not met
 *   NotFoundException  (404) → unknown course / lesson
 *   BadRequestException(400) → already enrolled / already completed
 */
@ApiTags('courses')
@Controller('v1/courses')
export class CoursesController {
  constructor(
    private readonly courseService: CourseService,
    private readonly lessonService: LessonService,
    private readonly enrollmentService: EnrollmentService,
  ) {}

  // ── Course catalogue ─────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a course with optional prerequisite chain' })
  createCourse(@Body() dto: CreateCourseDto) {
    return this.courseService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all courses' })
  listCourses() {
    return this.courseService.findAll();
  }

  @Get(':courseId')
  @ApiOperation({ summary: 'Get a single course by ID' })
  getCourse(@Param('courseId') courseId: string) {
    return this.courseService.findById(courseId);
  }

  // ── Lessons ──────────────────────────────────────────────────────────────

  @Post(':courseId/lessons')
  @ApiOperation({ summary: 'Add a lesson to a course with optional prerequisite chain' })
  createLesson(
    @Param('courseId') courseId: string,
    @Body() dto: CreateLessonDto,
  ) {
    // Validate the parent course exists before creating the lesson.
    this.courseService.findById(courseId);
    return this.lessonService.create({ ...dto, courseId });
  }

  @Get(':courseId/lessons')
  @ApiOperation({ summary: 'List lessons for a course (ordered by lesson.order)' })
  listLessons(@Param('courseId') courseId: string) {
    this.courseService.findById(courseId);
    return this.lessonService.findByCourse(courseId);
  }

  // ── Enrollment ───────────────────────────────────────────────────────────

  /**
   * Enrol a user in a course.
   *
   * Returns 409 with a structured body when prerequisite courses have not been
   * completed:
   *
   * ```json
   * {
   *   "statusCode": 409,
   *   "error": "Conflict",
   *   "message": "Prerequisites not met for course \"lifetimes-201\": complete ownership-101 first",
   *   "code": "PREREQUISITES_NOT_MET",
   *   "unmetPrerequisiteIds": ["ownership-101"]
   * }
   * ```
   */
  @Post('enrollments')
  @ApiOperation({ summary: 'Enrol a user in a course (blocked with 409 when prerequisites unmet)' })
  @ApiResponse({ status: 201, description: 'Enrollment created' })
  @ApiResponse({
    status: 409,
    description: 'Prerequisites not met — lists the unmet courseIds',
  })
  enroll(@Body() dto: EnrollDto) {
    return this.enrollmentService.enroll(dto.userId, dto.courseId);
  }

  @Post('enrollments/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a course enrollment as completed' })
  completeCourse(@Body() dto: CompleteCourseDto) {
    return this.enrollmentService.completeCourse(dto.userId, dto.courseId);
  }

  @Get('enrollments/:userId')
  @ApiOperation({ summary: "List a user's course enrollments" })
  listEnrollments(@Param('userId') userId: string) {
    return { userId, enrollments: this.enrollmentService.listEnrollments(userId) };
  }

  // ── Lesson progress ──────────────────────────────────────────────────────

  /**
   * Start a lesson for a user.
   *
   * Returns 409 with a structured body when prerequisite lessons have not been
   * completed.
   */
  @Post('lessons/start')
  @ApiOperation({ summary: 'Start a lesson (blocked with 409 when prerequisites unmet)' })
  @ApiResponse({ status: 201, description: 'Lesson progress record created' })
  @ApiResponse({
    status: 409,
    description: 'Prerequisite lessons not completed — lists the unmet lessonIds',
  })
  startLesson(@Body() dto: StartLessonDto) {
    return this.enrollmentService.startLesson(dto.userId, dto.lessonId);
  }

  @Post('lessons/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a lesson as completed' })
  completeLesson(@Body() dto: CompleteLessonDto) {
    return this.enrollmentService.completeLesson(dto.userId, dto.lessonId);
  }

  @Get(':courseId/progress/:userId')
  @ApiOperation({ summary: "List a user's lesson progress for a course" })
  listProgress(
    @Param('courseId') courseId: string,
    @Param('userId') userId: string,
  ) {
    this.courseService.findById(courseId);
    return {
      userId,
      courseId,
      progress: this.enrollmentService.listLessonProgress(userId, courseId),
    };
  }
}
