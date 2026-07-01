import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GradingJobEntity } from './entities/grading-job.entity';
import { GradingJobService } from './grading-job.service';
import { SubmissionModule } from '../submissions/submission.module';

@Module({
  imports: [TypeOrmModule.forFeature([GradingJobEntity]), forwardRef(() => SubmissionModule)],
  providers: [GradingJobService],
  exports: [GradingJobService],
})
export class JobsModule {}
