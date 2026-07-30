import { v4 as uuidv4 } from 'uuid';
import { TaskDifficulty } from './interfaces/task-difficulty.enum';

export class TaskEntity {
  id: string;
  lessonId: string;
  title: string;
  description: string;
  difficulty: TaskDifficulty;
  testCases: string[];
  expectedOutput: string;
  xpReward: number;
  passingScore: number;
  templateCode: string;
  /** Maximum retries for orchestrated task execution — #364 */
  maxRetries?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<TaskEntity>) {
    Object.assign(this, partial);
    this.id = this.id || uuidv4();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.isActive = this.isActive ?? true;
    this.testCases = this.testCases || [];
    this.xpReward = this.xpReward || 0;
    this.passingScore = this.passingScore || 70;
    this.templateCode = this.templateCode || '';
  }
}
