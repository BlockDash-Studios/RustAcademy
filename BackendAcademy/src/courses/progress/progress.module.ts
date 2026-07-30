import { Module } from '@nestjs/common';
import { CourseModule } from '../course.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { TransactionManagerService } from '../../common/transaction-manager.service';

@Module({
  imports: [CourseModule],
  controllers: [ProgressController],
  providers: [ProgressService, TransactionManagerService],
  exports: [ProgressService],
})
export class ProgressModule {}
