import { Injectable, Logger } from '@nestjs/common';

export interface DeadLetterRecord {
  jobId: string;
  jobType: string;
  payload: unknown;
  error: string;
  failedAt: Date;
  retryCount: number;
  originalQueue: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);
  private readonly deadLetterQueue: DeadLetterRecord[] = [];

  sendToDlq(record: DeadLetterRecord): void {
    this.deadLetterQueue.push(record);
    this.logger.warn(
      `Job ${record.jobId} (${record.jobType}) sent to DLQ after ${record.retryCount} retries: ${record.error}`,
    );
  }

  getDlqRecords(): DeadLetterRecord[] {
    return [...this.deadLetterQueue];
  }

  getDlqCount(): number {
    return this.deadLetterQueue.length;
  }

  replayJob(jobId: string): DeadLetterRecord | null {
    const index = this.deadLetterQueue.findIndex(r => r.jobId === jobId);
    if (index === -1) return null;
    const record = this.deadLetterQueue[index];
    this.deadLetterQueue.splice(index, 1);
    this.logger.log(`Job ${jobId} replayed from DLQ`);
    return record;
  }

  purgeDlq(): number {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue.length = 0;
    this.logger.log(`DLQ purged: ${count} records removed`);
    return count;
  }
}
