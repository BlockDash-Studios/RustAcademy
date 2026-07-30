import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GradingJobEntity } from './entities/grading-job.entity';
import { GradingJobService } from './grading-job.service';
import { SubmissionModule } from '../submissions/submission.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GradingJobEntity]),
    forwardRef(() => SubmissionModule),
    forwardRef(() => NotificationsModule),
  ],
  providers: [GradingJobService],
  exports: [GradingJobService],
})
export class JobsModule {}
