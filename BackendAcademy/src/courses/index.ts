export { CourseModule } from './course.module';
export { CourseService } from './course.service';
export { CourseEntity } from './course.entity';
export {
  CourseRevisionEntity,
  CourseRevisionReason,
} from './course-revision.entity';
export { CourseLevel } from './interfaces/course-level.enum';
export { ICourse, ILesson, ITask } from './interfaces/course.interface';
export { CreateCourseDto } from './dto/create-course.dto';
export { UpdateCourseDto } from './dto/update-course.dto';
export { RestoreRevisionDto } from './dto/restore-revision.dto';
export { ProgressModule } from './progress/progress.module';
export { ProgressService } from './progress/progress.service';
export { ProgressController } from './progress/progress.controller';
export {
  RegisterCourseProgressDto,
} from './progress/dto/register-course-progress.dto';
export {
  RecordLessonCompletionDto,
  RecordTaskCompletionDto,
} from './progress/dto/record-completion.dto';
export {
  CourseProgressStatus,
  ICourseSnapshot,
  IOverallSnapshot,
  IProgressSnapshot,
} from './progress/interfaces/progress-snapshot.interface';
