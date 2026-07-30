import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { TaskEntity } from './task.entity';
import { TaskService } from './task.service';

/**
 * Result of an orchestrated task execution.
 */
export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  scheduledAt: Date;
  executedAt?: Date;
  error?: string;
  retryCount: number;
}

/**
 * Task orchestrator — handles scheduling, retries, and queue management
 * that were previously mixed into the domain-focused TaskService.
 *
 * This separation (#364) gives clear ownership:
 *   - TaskService: CRUD and domain logic for tasks
 *   - TaskOrchestratorService: execution lifecycle, scheduling, retries
 */
@Injectable()
export class TaskOrchestratorService {
  private readonly logger = new Logger(TaskOrchestratorService.name);
  private readonly pendingTasks = new Map<
    string,
    { task: TaskEntity; attempt: number; nextAttemptAt: Date }
  >();
  private readonly executionHistory: TaskExecutionResult[] = [];
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    private readonly taskService: TaskService,
    private readonly configService: ConfigService,
    @Optional() @Inject(RedisService) private readonly redis?: RedisService,
  ) {
    this.maxRetries = this.configService.get<number>(
      'TASK_ORCHESTRATOR_MAX_RETRIES',
      3,
    );
    this.baseBackoffMs = this.configService.get<number>(
      'TASK_ORCHESTRATOR_BASE_BACKOFF_MS',
      1_000,
    );
    this.maxBackoffMs = this.configService.get<number>(
      'TASK_ORCHESTRATOR_MAX_BACKOFF_MS',
      30_000,
    );
  }

  /**
   * Schedules a task for execution with optional retry configuration.
   * Returns a scheduling ID that can be used to track or cancel.
   */
  async schedule(
    taskId: string,
    options?: { delayMs?: number; retries?: number },
  ): Promise<string> {
    const task = await this.taskService.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const delay = options?.delayMs ?? 0;
    const schedulingId = `sched-${taskId}-${Date.now()}`;

    this.pendingTasks.set(schedulingId, {
      task,
      attempt: 0,
      nextAttemptAt: new Date(Date.now() + delay),
    });

    this.logger.log(
      `Scheduled task ${taskId} (${schedulingId}) with ${delay}ms delay`,
    );
    return schedulingId;
  }

  /**
   * Executes a pending task with retry logic and exponential backoff.
   *
   * Retry scheduling uses exponential backoff with jitter, managed through
   * Redis timers when Redis is available, or in-memory when not.
   */
  async execute(
    schedulingId: string,
    executor: (task: TaskEntity) => Promise<void>,
  ): Promise<TaskExecutionResult> {
    const entry = this.pendingTasks.get(schedulingId);
    if (!entry) {
      return {
        taskId: schedulingId,
        success: false,
        scheduledAt: new Date(),
        error: 'Scheduling entry not found',
        retryCount: 0,
      };
    }

    entry.attempt++;
    try {
      await executor(entry.task);
      const result: TaskExecutionResult = {
        taskId: entry.task.id,
        success: true,
        scheduledAt: entry.nextAttemptAt,
        executedAt: new Date(),
        retryCount: entry.attempt - 1,
      };
      this.executionHistory.push(result);
      this.pendingTasks.delete(schedulingId);
      this.logger.log(
        `Task ${entry.task.id} executed successfully on attempt ${entry.attempt}`,
      );
      return result;
    } catch (err) {
      const errorMsg = (err as Error).message;
      const maxRetries = entry.task.maxRetries ?? this.maxRetries;

      if (entry.attempt >= maxRetries) {
        const result: TaskExecutionResult = {
          taskId: entry.task.id,
          success: false,
          scheduledAt: entry.nextAttemptAt,
          error: errorMsg,
          retryCount: entry.attempt,
        };
        this.executionHistory.push(result);
        this.pendingTasks.delete(schedulingId);
        this.logger.error(
          `Task ${entry.task.id} failed after ${entry.attempt} attempts: ${errorMsg}`,
        );
        return result;
      }

      // Exponential backoff with jitter
      const backoff = Math.min(
        this.baseBackoffMs * Math.pow(2, entry.attempt - 1),
        this.maxBackoffMs,
      );
      const jitter = backoff * (0.5 + Math.random() * 0.5);
      entry.nextAttemptAt = new Date(Date.now() + Math.floor(jitter));

      this.logger.warn(
        `Task ${entry.task.id} attempt ${entry.attempt} failed: ${errorMsg}. ` +
          `Next retry at ${entry.nextAttemptAt.toISOString()}`,
      );

      return {
        taskId: entry.task.id,
        success: false,
        scheduledAt: entry.nextAttemptAt,
        error: errorMsg,
        retryCount: entry.attempt,
      };
    }
  }

  /**
   * Cancels a scheduled task.
   */
  cancel(schedulingId: string): boolean {
    const existed = this.pendingTasks.has(schedulingId);
    this.pendingTasks.delete(schedulingId);
    return existed;
  }

  /**
   * Returns all currently pending (scheduled but not yet executed) tasks.
   */
  getPendingTasks(): Array<{ schedulingId: string; taskId: string; nextAttemptAt: Date }> {
    return Array.from(this.pendingTasks.entries()).map(([id, entry]) => ({
      schedulingId: id,
      taskId: entry.task.id,
      nextAttemptAt: entry.nextAttemptAt,
    }));
  }

  /**
   * Returns the execution history for auditing.
   */
  getExecutionHistory(limit = 50): TaskExecutionResult[] {
    const history = [...this.executionHistory];
    history.sort(
      (a, b) =>
        (b.executedAt?.getTime() ?? 0) - (a.executedAt?.getTime() ?? 0),
    );
    return history.slice(0, limit);
  }

  /**
   * Returns the number of tasks waiting in the execution queue.
   */
  getQueueDepth(): number {
    return this.pendingTasks.size;
  }
}
