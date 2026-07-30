import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface CorrelationContext {
  correlationId: string;
  userId?: string;
  requestId?: string;
}

export interface LogEntry {
  level: string;
  message: string;
  context?: string;
  correlationId?: string;
  userId?: string;
  requestId?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

@Injectable({ scope: Scope.DEFAULT })
export class CorrelationLoggerService implements LoggerService {
  private static readonly asyncLocalStorage = new AsyncLocalStorage<CorrelationContext>();
  private readonly logs: LogEntry[] = [];

  static run<T>(context: CorrelationContext, fn: () => T | Promise<T>): T | Promise<T> {
    return CorrelationLoggerService.asyncLocalStorage.run(context, fn);
  }

  static getCorrelationId(): string | undefined {
    return CorrelationLoggerService.asyncLocalStorage.getStore()?.correlationId;
  }

  static getContext(): CorrelationContext | undefined {
    return CorrelationLoggerService.asyncLocalStorage.getStore();
  }

  log(message: string, context?: string): void {
    this.write('log', message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: string, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: string, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: string, context?: string): void {
    this.write('verbose', message, context);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getLogsByCorrelationId(correlationId: string): LogEntry[] {
    return this.logs.filter((log) => log.correlationId === correlationId);
  }

  clearLogs(): void {
    this.logs.length = 0;
  }

  private write(level: string, message: string, context?: string, trace?: string): void {
    const store = CorrelationLoggerService.asyncLocalStorage.getStore();
    const entry: LogEntry = {
      level,
      message: trace ? `${message} - ${trace}` : message,
      context,
      correlationId: store?.correlationId,
      userId: store?.userId,
      requestId: store?.requestId,
      timestamp: new Date(),
    };
    this.logs.push(entry);
  }
}