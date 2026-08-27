import { Module } from '@nestjs/common';
import { TutorProfileController } from './tutor-profile.controller';
import { TutorProfileService } from './tutor-profile.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TutorProfileController],
  providers: [TutorProfileService],
  exports: [TutorProfileService],
})
export class TutorProfileModule {}
