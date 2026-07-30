import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { CourseRatingService } from './course-rating.service';
import { CertificateService } from './certificate.service';
import { CourseEntity } from './course.entity';
import { CourseRevisionEntity } from './course-revision.entity';
import { CourseRatingEntity } from './course-rating.entity';
import { RewardsModule } from '../rewards/rewards.module';
import { TransactionManagerService } from '../common/transaction-manager.service';
import { ConfigModule } from '@nestjs/config';
import { SearchModule } from '../search/search.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      CourseEntity,
      CourseRevisionEntity,
      CourseRatingEntity,
    ]),
    RewardsModule,
    SearchModule,
    RedisModule,
  ],
  controllers: [CourseController],
  providers: [
    CourseService,
    CourseRatingService,
    CertificateService,
    TransactionManagerService,
  ],
  exports: [CourseService, CourseRatingService, CertificateService],
})
export class CourseModule {}
