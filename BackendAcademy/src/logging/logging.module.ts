import { Module } from '@nestjs/common';
import { ErrorTrackingService } from './error-tracking.service';

@Module({
  providers: [ErrorTrackingService],
  exports: [ErrorTrackingService],
})
export class LoggingModule {}
