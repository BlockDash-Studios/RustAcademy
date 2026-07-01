import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { RewardsModule } from '../rewards/rewards.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AnalyticsModule, RewardsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
