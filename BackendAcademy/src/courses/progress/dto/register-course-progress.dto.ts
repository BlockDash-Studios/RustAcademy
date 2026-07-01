import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RegisterCourseProgressDto {
  @IsString()
  courseId: string;

  /**
   * Total number of lessons the learner needs to complete for this course.
   * Optional - pass an explicit integer (including 0) to set; omitting the
   * key on a re-register call keeps the previously registered value.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  totalLessons?: number;

  /**
   * Total number of tasks the learner needs to complete for this course.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  totalTasks?: number;
}
