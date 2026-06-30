import { Injectable } from '@nestjs/common';
import { SearchQueryDto } from './dto/search-query.dto';
import {
  CourseSearchHit,
  PostSearchHit,
  SearchResults,
  UserSearchHit,
} from './interfaces/search.interface';

@Injectable()
export class SearchService {
  /** Defensive cap on page size. */
  private static readonly MAX_LIMIT = 50;
  private static readonly DEFAULT_LIMIT = 10;

  /**
   * In-memory fixture set. Replace with a real SearchRepository backed by
   * Postgres `tsvector` (or an external index like Meilisearch / pg_trgm).
   *
   * TODO: replace with a SearchRepository.searchUsers|searchCourses|searchPosts.
   */
  private readonly users: UserSearchHit[] = [
    { id: 'user-0001', username: 'rustmaster', displayName: 'Rust Master' },
    { id: 'user-0002', username: 'codewarrior', displayName: 'Code Warrior' },
    { id: 'user-0003', username: 'stellar-learner', displayName: 'Stellar Learner' },
    { id: 'user-0004', username: 'soroban-tutor', displayName: 'Soroban Tutor' },
    { id: 'user-0005', username: 'blockdash-dev', displayName: 'BlockDash Dev' },
    { id: 'user-0006', username: 'rustacean', displayName: 'Rustacean' },
    { id: 'user-0007', username: 'memorieslock', displayName: 'MemoriesLock' },
    { id: 'user-0008', username: 'rust-newbie', displayName: 'Rust Newbie' },
  ];

  private readonly courses: CourseSearchHit[] = [
    {
      id: 'course-001',
      title: 'Rust Fundamentals',
      description: 'Learn ownership, borrowing, and lifetimes.',
    },
    {
      id: 'course-002',
      title: 'Stellar Smart Contracts',
      description: 'Build Soroban contracts from scratch.',
    },
    {
      id: 'course-003',
      title: 'Advanced Rust',
      description: 'Async, traits, and macros deep-dive.',
    },
    {
      id: 'course-004',
      title: 'Stellar Payments',
      description: 'Send and receive XLM/USDC using Horizon.',
    },
    {
      id: 'course-005',
      title: 'Rust for Web3',
      description: 'Blockchain, NFTs, and on-chain Rust.',
    },
  ];

  private readonly posts: PostSearchHit[] = [
    {
      id: 'post-001',
      title: 'My first Soroban contract',
      body: 'Building helloworld on Stellar is fun.',
    },
    {
      id: 'post-002',
      title: 'Rust lifetime annotations explained',
      body: 'A clear walkthrough of the borrow checker.',
    },
    {
      id: 'post-003',
      title: 'Stellar path payments in 2026',
      body: 'New path-finding APIs and best practices.',
    },
    {
      id: 'post-004',
      title: 'Onboarding for new Rust learners',
      body: 'What the Rust Academy cohort should do first.',
    },
    {
      id: 'post-005',
      title: 'Memo on stellar transactions',
      body: 'How text memos are encoded and limits.',
    },
  ];

  /**
   * Apply pagination + substring matching. Pure helper - intent is shared
   * across all 3 resource types.
   *
   * Limit semantics: an explicit `limit = 0` (or any non-positive / non-finite
   * value) is treated as "not provided" and falls back to `DEFAULT_LIMIT`.
   * This avoids accidentally returning the full corpus when someone wires
   * limit from a UI control that starts at zero.
   */
  private paginate<T>(
    items: T[],
    q: string | undefined,
    limit: number | undefined,
    offset: number | undefined,
    matchFields: (item: T) => string,
  ): SearchResults<T> {
    const rawLimit = Number(limit);
    const effectiveLimit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, SearchService.MAX_LIMIT)
        : SearchService.DEFAULT_LIMIT;
    const effectiveOffset = Math.max(0, Number(offset) || 0);
    const needle = (q || '').toLowerCase().trim();

    const matched = needle
      ? items.filter((item) =>
          matchFields(item).toLowerCase().includes(needle),
        )
      : items;

    const total = matched.length;
    const page = matched.slice(effectiveOffset, effectiveOffset + effectiveLimit);
    const hasMore = effectiveOffset + page.length < total;

    const response: SearchResults<T> = {
      entries: page,
      total,
      hasMore,
    };
    if (hasMore) {
      response.nextOffset = effectiveOffset + page.length;
    }
    return response;
  }

  searchUsers(query: SearchQueryDto): SearchResults<UserSearchHit> {
    return this.paginate(
      this.users,
      query.q,
      query.limit,
      query.offset,
      (u) => `${u.id} ${u.username} ${u.displayName}`,
    );
  }

  searchCourses(query: SearchQueryDto): SearchResults<CourseSearchHit> {
    return this.paginate(
      this.courses,
      query.q,
      query.limit,
      query.offset,
      (c) => `${c.id} ${c.title} ${c.description}`,
    );
  }

  searchPosts(query: SearchQueryDto): SearchResults<PostSearchHit> {
    return this.paginate(
      this.posts,
      query.q,
      query.limit,
      query.offset,
      (p) => `${p.id} ${p.title} ${p.body}`,
    );
  }
}
