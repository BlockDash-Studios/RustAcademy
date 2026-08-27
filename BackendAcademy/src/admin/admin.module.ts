import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SubmissionsModule } from '../submissions/submissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SubmissionsModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
