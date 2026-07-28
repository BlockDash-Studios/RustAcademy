import { CourseEntity } from '../courses/course.entity';
import { CourseLevel } from '../courses';
import { CourseService } from '../courses/course.service';
import { RewardsService } from '../rewards/rewards.service';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let courseService: CourseService;
  let searchService: SearchService;

  beforeEach(() => {
    courseService = new CourseService(
      null as any,
      null as any,
      { recordActivity: jest.fn() } as unknown as RewardsService,
    );
    searchService = new SearchService(courseService);
  });

  async function addCourse(partial: Partial<CourseEntity>) {
    return courseService.create({
      title: partial.title ?? 'Rust Basics',
      description: partial.description ?? 'Learn Rust fundamentals',
      level: partial.level ?? CourseLevel.BEGINNER,
      order: partial.order ?? 1,
      learningPathId: partial.learningPathId ?? 'rust',
      duration: partial.duration ?? 60,
      category: partial.category,
      categories: partial.categories,
      tags: partial.tags,
      prerequisites: partial.prerequisites,
      skills: partial.skills,
      xpReward: partial.xpReward,
    });
  }

  it('finds active courses by tag or category', async () => {
    const ownership = await addCourse({
      title: 'Ownership',
      category: 'fundamentals',
      tags: ['rust', 'ownership'],
    });
    await addCourse({
      title: 'Web APIs',
      category: 'backend',
      tags: ['axum'],
    });

    await expect(
      searchService.searchCourses({
        tags: ['ownership'],
        categories: ['backend'],
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ownership.id }),
        expect.objectContaining({ title: 'Web APIs' }),
      ]),
    );
  });

  it('supports requiring all tag and category filters', async () => {
    const matchingCourse = await addCourse({
      title: 'Async Rust',
      categories: ['backend', 'systems'],
      tags: ['rust', 'async'],
    });
    await addCourse({
      title: 'Intro Rust',
      category: 'fundamentals',
      tags: ['rust'],
    });

    await expect(
      searchService.searchCourses({
        tags: ['rust', 'async'],
        categories: ['backend'],
        match: 'all',
      }),
    ).resolves.toEqual([expect.objectContaining({ id: matchingCourse.id })]);
  });
});
