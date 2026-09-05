import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CourseModule } from '../courses/course.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AnalyticsModule, RewardsModule, SubmissionsModule, CourseModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
