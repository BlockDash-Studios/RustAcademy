import { Controller, Get, Query } from '@nestjs/common';
import { SearchCoursesQueryDto } from './dto/search-courses-query.dto';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import {
  PostSearchHit,
  SearchResults,
  UserSearchHit,
} from './interfaces/search.interface';
import { CourseEntity } from '../courses/course.entity';

/**
 * Multi-resource search controller.
 *
 * Each endpoint follows the same shape: case-insensitive substring match on
 * a small set of fields, with limit/offset pagination.
 */
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /search/users?q=<query>&limit=&offset=
   * Substring search across userId, username, displayName.
   */
  @Get('users')
  searchUsers(@Query() query: SearchQueryDto): SearchResults<UserSearchHit> {
    return this.searchService.searchUsers(query);
  }

  /**
   * GET /search/courses?q=<query>&limit=&offset=
   * Substring search across courseId, title, description, tags, and categories.
   */
  @Get('courses')
  searchCourses(
    @Query() query: SearchCoursesQueryDto,
  ): Promise<SearchResults<CourseEntity>> {
    return this.searchService.searchCourses(query);
  }

  /**
   * GET /search/posts?q=<query>&limit=&offset=
   * Substring search across postId, title, body.
   */
  @Get('posts')
  searchPosts(@Query() query: SearchQueryDto): SearchResults<PostSearchHit> {
    return this.searchService.searchPosts(query);
  }
}
