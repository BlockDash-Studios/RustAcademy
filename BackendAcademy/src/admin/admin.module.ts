import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SubmissionsModule } from '../submissions/submissions.module';
import { ReportsModule } from '../reports/reports.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [SubmissionsModule, ReportsModule, SocialModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
