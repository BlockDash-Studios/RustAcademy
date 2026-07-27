import { Module, forwardRef } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [forwardRef(() => JobsModule)],
  controllers: [ChallengesController],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}
