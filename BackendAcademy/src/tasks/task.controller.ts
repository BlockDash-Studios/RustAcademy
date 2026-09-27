import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ExecuteTaskDto } from './dto/execute-task.dto';
import { WasmSandboxService } from './wasm-sandbox.service';

@Controller('tasks')
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly wasmSandboxService: WasmSandboxService,
  ) {}

  @Post(':id/execute')
  async execute(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExecuteTaskDto) {
    const task = await this.taskService.findById(id);
    if (!task || !task.isActive) {
      throw new NotFoundException('Task not found');
    }
    return this.wasmSandboxService.execute(task, dto.code);
  }

  @Post()
  async create(@Body() dto: CreateTaskDto) {
    return this.taskService.create(dto);
  }

  @Get()
  async findAll() {
    return this.taskService.findAll();
  }

  @Get('lesson/:lessonId')
  async findByLessonId(@Param('lessonId') lessonId: string) {
    return this.taskService.findByLessonId(lessonId);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.taskService.findById(id);
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.taskService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.taskService.remove(id);
  }
}
