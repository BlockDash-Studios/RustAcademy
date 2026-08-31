import { forwardRef, Module } from '@nestjs/common';
import { CourseModule } from '../courses/course.module';
import { UsersModule } from '../users/users.module';
import { UserProfileModule } from '../users/user-profile.module';
import { SocialModule } from '../social/social.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchIndexerService } from './search-indexer.service';
import { InMemorySearchRepository } from './in-memory-search.repository';
import { SEARCH_REPOSITORY } from './search.constants';

@Module({
  imports: [
    forwardRef(() => CourseModule),
    UsersModule,
    UserProfileModule,
    SocialModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchIndexerService,
    InMemorySearchRepository,
    {
      provide: SEARCH_REPOSITORY,
      useExisting: InMemorySearchRepository,
    },
  ],
  exports: [SearchService, SearchIndexerService],
})
export class SearchModule {}