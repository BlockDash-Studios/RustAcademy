import { Module } from '@nestjs/common';
import { LessonController } from './lesson.controller';
import { LessonService } from './lesson.service';
import { SearchModule } from '../search/search.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [SearchModule, RedisModule],
  controllers: [LessonController],
  providers: [LessonService],
  exports: [LessonService],
})
export class LessonModule {}
