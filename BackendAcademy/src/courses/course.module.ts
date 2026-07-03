import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { CourseRatingService } from './course-rating.service';
import { CourseEntity } from './course.entity';
import { CourseRevisionEntity } from './course-revision.entity';
import { CourseRatingEntity } from './course-rating.entity';
import { RewardsModule } from '../rewards/rewards.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseEntity,
      CourseRevisionEntity,
      CourseRatingEntity,
    ]),
    RewardsModule,
  ],
  controllers: [CourseController],
  providers: [CourseService, CourseRatingService],
  exports: [CourseService, CourseRatingService],
})
export class CourseModule {}
