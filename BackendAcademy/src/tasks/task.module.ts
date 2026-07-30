import { Module } from '@nestjs/common';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { TaskOrchestratorService } from './task-orchestrator.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [TaskController],
  providers: [TaskService, TaskOrchestratorService],
  exports: [TaskService, TaskOrchestratorService],
})
export class TaskModule {}
