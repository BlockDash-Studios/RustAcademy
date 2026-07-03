import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  HttpCode,
} from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseRatingService } from './course-rating.service';
import { CourseRevisionEntity } from './course-revision.entity';
import { CourseEntity } from './course.entity';
import { CourseRatingEntity } from './course-rating.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { RestoreRevisionDto } from './dto/restore-revision.dto';
import { CompleteCourseDto } from './dto/complete-course.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { CourseRatingStatsDto } from './dto/rating-stats.dto';
import { JwtLearnerGuard } from '../auth/guards/jwt-learner.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Controller('courses')
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly ratingService: CourseRatingService,
  ) {}

  @Post()
  async create(@Body() dto: CreateCourseDto) {
    return this.courseService.create(dto);
  }

  @Get()
  async findAll() {
    return this.courseService.findAll();
  }

  @Get('level/:level')
  async findByLevel(@Param('level') level: string) {
    return this.courseService.findByLevel(level);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.courseService.findById(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
  ): Promise<CourseEntity> {
    return this.courseService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.courseService.remove(id);
  }

  // ---------------------------------------------------------------------------
  // Revision history endpoints
  //
  // Route ordering note: the explicit `/latest` and `/count` paths are
  // declared before the parametric `/revisions/:version` so Express / Nest
  // matches them first. Moving them below would break the lookup behavior.
  // ---------------------------------------------------------------------------

  @Get(':id/revisions')
  async listRevisions(
    @Param('id') id: string,
  ): Promise<CourseRevisionEntity[]> {
    return this.courseService.getRevisions(id);
  }

  @Get(':id/revisions/latest')
  async getLatestRevision(
    @Param('id') id: string,
  ): Promise<CourseRevisionEntity | null> {
    return this.courseService.getLatestRevision(id);
  }

  @Get(':id/revisions/count')
  async getRevisionCount(
    @Param('id') id: string,
  ): Promise<{ count: number }> {
    const count = await this.courseService.getRevisionCount(id);
    return { count };
  }

  @Get(':id/revisions/:version')
  async getRevision(
    @Param('id') id: string,
    @Param('version') version: string,
  ): Promise<CourseRevisionEntity | null> {
    return this.courseService.getRevisionByVersion(id, Number(version));
  }

  @Post(':id/revisions/:version/restore')
  async restoreRevision(
    @Param('id') id: string,
    @Param('version') version: string,
    @Body() dto: RestoreRevisionDto,
  ): Promise<CourseEntity> {
    return this.courseService.restoreRevision(
      id,
      Number(version),
      dto.revisionAuthor,
    );
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string, @Body() dto: CompleteCourseDto) {
    return this.courseService.completeCourse(id, dto.userId);
  }

  // ---------------------------------------------------------------------------
  // Course ratings endpoints
  // ---------------------------------------------------------------------------

  /**
   * Submit or update a rating for a course.
   * Requires authentication. If user already rated this course, their rating is updated (upsert).
   * Returns 201 Created on first submission, 200 OK on update.
   */
  @Post(':id/ratings')
  @UseGuards(JwtLearnerGuard)
  async submitRating(
    @Param('id') courseId: string,
    @Body() dto: CreateRatingDto,
    @Request() req: Express.Request & { user: JwtPayload },
  ): Promise<CourseRatingEntity> {
    const userId = req.user.sub;
    return this.ratingService.submitRating(courseId, userId, dto);
  }

  /**
   * List all ratings for a course with pagination support.
   * Public endpoint (no auth required).
   * Supports ?page=1&per_page=20 query params.
   */
  @Get(':id/ratings')
  async listRatings(
    @Param('id') courseId: string,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const perPageNum = perPage ? parseInt(perPage, 10) : 20;
    return this.ratingService.listRatings(courseId, pageNum, perPageNum);
  }

  /**
   * Get aggregated rating statistics for a course.
   * Public endpoint (no auth required).
   * Returns average rating (2 decimal places), total count, and star distribution.
   */
  @Get(':id/ratings/stats')
  async getRatingStats(@Param('id') courseId: string): Promise<CourseRatingStatsDto> {
    return this.ratingService.getRatingStats(courseId);
  }

  /**
   * Delete a user's rating for a course.
   * Requires authentication. Only allows deleting own rating.
   * Returns 204 No Content on success.
   */
  @Delete(':id/ratings')
  @HttpCode(204)
  @UseGuards(JwtLearnerGuard)
  async deleteRating(
    @Param('id') courseId: string,
    @Request() req: Express.Request & { user: JwtPayload },
  ): Promise<void> {
    const userId = req.user.sub;
    await this.ratingService.deleteRating(courseId, userId);
  }
}
