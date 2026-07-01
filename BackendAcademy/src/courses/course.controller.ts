import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseRevisionEntity } from './course-revision.entity';
import { CourseEntity } from './course.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { RestoreRevisionDto } from './dto/restore-revision.dto';
import { CompleteCourseDto } from './dto/complete-course.dto';

@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

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
}
