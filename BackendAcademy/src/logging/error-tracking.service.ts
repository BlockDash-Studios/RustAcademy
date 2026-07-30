import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

export interface ErrorTrackingReport {
  source: 'placeholder';
  context?: string;
  message: string;
  stack?: string;
  timestamp: string;
}

export interface AuditLogEntry {
  action: string;
  actor: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
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

  private readonly auditLog: AuditLogEntry[] = [];

  captureAuditLog(action: string, actor: string, resourceType: string, resourceId: string, details: Record<string, unknown> = {}): AuditLogEntry {
    const entry: AuditLogEntry = { action, actor, resourceType, resourceId, details, timestamp: new Date().toISOString() };
    this.auditLog.push(entry);
    this.logger.log(`Audit: ${actor} ${action} ${resourceType} ${resourceId}`);
    return entry;
  }

  getAuditLog(resourceType?: string, resourceId?: string): AuditLogEntry[] {
    let entries = this.auditLog;
    if (resourceType) entries = entries.filter((e) => e.resourceType === resourceType);
    if (resourceId) entries = entries.filter((e) => e.resourceId === resourceId);
    return entries;
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
