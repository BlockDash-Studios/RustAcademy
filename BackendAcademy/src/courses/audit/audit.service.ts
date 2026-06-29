import { Injectable } from '@nestjs/common';

export interface AuditLog {
  id: string;
  action: string;
  user?: string;
  resource?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

@Injectable()
export class AuditLogService {
  private readonly logs: AuditLog[] = [];

  create(
    action: string,
    user?: string,
    resource?: string,
    metadata?: Record<string, any>,
  ): AuditLog {
    const log: AuditLog = {
      id: crypto.randomUUID(),
      action,
      user,
      resource,
      metadata,
      timestamp: new Date(),
    };

    this.logs.push(log);

    return log;
  }

  findAll(): AuditLog[] {
    return this.logs.sort(
      (a, b) =>
        b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  findByUser(user: string): AuditLog[] {
    return this.logs.filter(
      (log) => log.user === user,
    );
  }

  clear(): void {
    this.logs.length = 0;
  }
}