import { Module } from '@nestjs/common';
import { CourseModule } from '../courses';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchIndexerService } from './search-indexer.service';

@Module({
  imports: [CourseModule],
  controllers: [SearchController],
  providers: [SearchService, SearchIndexerService],
  exports: [SearchService, SearchIndexerService],
})
export class SearchModule {}
