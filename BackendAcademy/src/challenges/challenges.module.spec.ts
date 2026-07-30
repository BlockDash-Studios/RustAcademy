import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ChallengesController } from './challenges.controller';
import { ChallengesModule } from './challenges.module';
import { ChallengesService } from './challenges.service';
import { GradingJobService } from '../jobs/grading-job.service';

@Module({
  providers: [{ provide: GradingJobService, useValue: {} }],
  exports: [GradingJobService],
})
class MockJobsModule {}

describe('ChallengesModule', () => {
  it('registers challenge voting controller and service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ChallengesModule],
    })
    .overrideModule(require('../jobs/jobs.module').JobsModule)
    .useModule(MockJobsModule)
    .compile();

    expect(moduleRef.get(ChallengesController)).toBeInstanceOf(ChallengesController);
    expect(moduleRef.get(ChallengesService)).toBeInstanceOf(ChallengesService);
  });
});
