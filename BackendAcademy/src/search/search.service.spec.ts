import { CourseEntity } from '../courses/course.entity';
import { CourseLevel } from '../courses';
import { CourseService } from '../courses/course.service';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let courseService: CourseService;
  let searchService: SearchService;

  function makeStoreRepo() {
    const store = new Map<string, any>();
    return {
      create: (partial: any) => ({ isActive: true, ...partial }),
      save: async (entity: any) => {
        if (!entity.id) entity.id = crypto.randomUUID();
        if (!entity.createdAt) entity.createdAt = new Date();
        entity.updatedAt = new Date();
        store.set(entity.id, entity);
        return entity;
      },
      findOne: async (options: any) => {
        if (options?.where?.id) return store.get(options.where.id) ?? null;
        return null;
      },
      find: async (options: any) => {
        let rows = Array.from(store.values());
        if (options?.where) {
          rows = rows.filter((r: any) =>
            Object.entries(options.where).every(([k, v]) => r[k] === v),
          );
        }
        return rows;
      },
      count: async () => store.size,
    };
  }

  beforeEach(() => {
    courseService = new CourseService(
      makeStoreRepo() as any,
      makeStoreRepo() as any,
      {} as any,
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

    const result = await searchService.searchCourses({
        tags: ['ownership'],
        categories: ['backend'],
      });
    expect(result.entries).toEqual(
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

    const result = await searchService.searchCourses({
        tags: ['rust', 'async'],
        categories: ['backend'],
        match: 'all',
      });
    expect(result.entries).toEqual([expect.objectContaining({ id: matchingCourse.id })]);
  });
});
