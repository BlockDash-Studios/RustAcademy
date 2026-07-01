import { Module } from '@nestjs/common';
import { CourseModule } from '../courses';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [CourseModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
