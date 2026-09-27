import { Module } from '@nestjs/common';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { WasmSandboxService } from './wasm-sandbox.service';

@Module({
  controllers: [TaskController],
  providers: [TaskService, WasmSandboxService],
  exports: [TaskService, WasmSandboxService],
})
export class TaskModule {}
