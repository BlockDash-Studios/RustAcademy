import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { LoggingModule } from '../logging/logging.module';
import { TransactionManagerService } from '../common/transaction-manager.service';

@Module({
  imports: [LoggingModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, TransactionManagerService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}