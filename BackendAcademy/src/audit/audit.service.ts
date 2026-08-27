import { Injectable, Logger } from '@nestjs/common';
import { CorrelationLoggerService } from '../logging/logger.service';

export interface AuditEvent {
  action: string;
  actor?: string;
  outcome: 'SUCCESS' | 'FAILURE';
  session?: string;
  correlation?: string;
  requestContext?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface AuditLog extends AuditEvent {
  id: string;
  timestamp: Date;
}

@Injectable()
export class AuditLogService {
  private readonly logs: AuditLog[] = [];
  private readonly logger = new Logger(AuditLogService.name);

  constructor() {}

  create(event: AuditEvent): AuditLog {
    const sanitizedContext = this.sanitize(event.requestContext);
    const correlation = event.correlation || CorrelationLoggerService.getCorrelationId();

    const log: AuditLog = {
      id: crypto.randomUUID(),
      ...event,
      correlation,
      requestContext: sanitizedContext,
      timestamp: new Date(),
    };

    this.logs.push(log);

    // Provide structured output to the standard logger without secrets
    this.logger.log(
      `Audit: ${event.action} | Actor: ${event.actor || '-'} | Outcome: ${event.outcome} | Session: ${event.session || '-'} | Correlation: ${correlation}`,
    );

    return log;
  }

  private sanitize(ctx?: Record<string, any>): Record<string, any> | undefined {
    if (!ctx) return undefined;
    const sanitized = { ...ctx };
    const secrets = ['password', 'token', 'secret', 'authorization', 'cookie', 'refreshtoken', 'accesstoken'];
    for (const key of Object.keys(sanitized)) {
      if (secrets.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }

  findAll(): AuditLog[] {
    return this.logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  findByUser(user: string): AuditLog[] {
    return this.logs.filter((log) => log.actor === user);
  }

  clear(): void {
    this.logs.length = 0;
  }
}
