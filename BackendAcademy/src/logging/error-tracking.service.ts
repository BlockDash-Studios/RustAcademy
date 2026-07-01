import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

export interface ErrorTrackingReport {
  source: 'placeholder';
  context?: string;
  message: string;
  stack?: string;
  timestamp: string;
}

@Injectable()
export class ErrorTrackingService implements OnModuleInit {
  private readonly logger = new Logger(ErrorTrackingService.name);

  onModuleInit(): void {
    process.on('uncaughtException', (error: Error) => {
      this.captureException(error, 'process');
    });

    process.on('unhandledRejection', (reason: unknown) => {
      this.captureException(reason, 'process');
    });

    this.logger.log('Error tracking placeholder integration initialized');
  }

  captureException(error: Error | unknown, context?: string): ErrorTrackingReport {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const report: ErrorTrackingReport = {
      source: 'placeholder',
      context,
      message,
      stack,
      timestamp: new Date().toISOString(),
    };

    this.logger.warn(`Captured error report for ${context ?? 'unknown'}: ${message}`);

    return report;
  }
}
