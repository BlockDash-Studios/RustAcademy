import { Module } from '@nestjs/common';
import { ErrorTrackingService } from './error-tracking.service';
import { CorrelationLoggerService } from './logger.service';

@Module({
  providers: [ErrorTrackingService, CorrelationLoggerService],
  exports: [ErrorTrackingService, CorrelationLoggerService],
})
export class LoggingModule {}