import { CourseEntity } from '../courses/course.entity';
import { SearchIndexerService } from './search-indexer.service';

describe('SearchIndexerService', () => {
  let indexer: SearchIndexerService;

  beforeEach(() => {
    indexer = new SearchIndexerService();
  });

  function makeCourse(overrides: Partial<CourseEntity> = {}): CourseEntity {
    return new CourseEntity({
      id: overrides.id ?? crypto.randomUUID(),
      title: overrides.title ?? 'Rust Basics',
      description: overrides.description ?? 'Learn Rust fundamentals',
      tags: overrides.tags ?? ['rust'],
      category: overrides.category ?? 'fundamentals',
      categories: overrides.categories ?? ['fundamentals'],
      level: overrides.level as any,
      order: overrides.order ?? 1,
      learningPathId: overrides.learningPathId ?? 'rust',
      duration: overrides.duration ?? 60,
      ...overrides,
    });
  }

  describe('indexCourse / removeCourse / size', () => {
    it('indexes a course and reports correct size', () => {
      const course = makeCourse({ id: 'c1' });
      indexer.indexCourse(course);
      expect(indexer.size()).toBe(1);
    });

    it('idempotently upserts the same course', () => {
      indexer.indexCourse(makeCourse({ id: 'c1', title: 'V1' }));
      indexer.indexCourse(makeCourse({ id: 'c1', title: 'V2' }));
      expect(indexer.size()).toBe(1);
      const courses = indexer.getIndexedCourses();
      expect(courses[0].title).toBe('V2');
    });

    it('removes a course', () => {
      indexer.indexCourse(makeCourse({ id: 'c1' }));
      indexer.removeCourse('c1');
      expect(indexer.size()).toBe(0);
    });
  });

  describe('scoreCourse', () => {
    it('scores title matches higher than description', () => {
      const course = makeCourse({
        title: 'Advanced Rust',
        description: 'This course covers everything',
        tags: [],
        categories: [],
        category: 'general',
      });
      const titleScore = indexer.scoreCourse(course, 'rust');
      // title (3) + description (0) = 3
      expect(titleScore).toBe(3);
    });

    it('scores tag matches higher than description', () => {
      const course = makeCourse({
        title: 'Web Frameworks',
        description: 'Build apps',
        tags: ['rust', 'axum'],
      });
      // title doesn't match "rust", tags match (2), description doesn't match
      const score = indexer.scoreCourse(course, 'rust');
      expect(score).toBe(2);
    });

    it('returns 0 when nothing matches', () => {
      const course = makeCourse({
        title: 'Python Basics',
        description: 'Learn Python',
        tags: ['python'],
      });
      expect(indexer.scoreCourse(course, 'rust')).toBe(0);
    });

    it('scores category matches', () => {
      const course = makeCourse({
        category: 'systems',
        categories: ['systems', 'performance'],
      });
      expect(indexer.scoreCourse(course, 'systems')).toBe(0.5);
    });
  });

  describe('rankCourses — deterministic ordering', () => {
    it('sorts by score descending', () => {
      const highScore = makeCourse({
        id: 'c-high',
        title: 'Rust Mastery',
        tags: ['rust'],
      });
      const lowScore = makeCourse({
        id: 'c-low',
        title: 'Python Basics',
        description: 'Rust is mentioned here',
      });

      const ranked = indexer.rankCourses([lowScore, highScore], 'rust');
      expect(ranked).toHaveLength(2);
      expect(ranked[0].course.id).toBe('c-high');
      expect(ranked[1].course.id).toBe('c-low');
    });

    it('breaks ties deterministically by course.id', () => {
      // Two courses with identical scores
      const courseA = makeCourse({
        id: 'aaa',
        title: 'Course A',
        description: 'rust content',
      });
      const courseB = makeCourse({
        id: 'zzz',
        title: 'Course B',
        description: 'rust content',
      });

      const ranked1 = indexer.rankCourses([courseB, courseA], 'rust');
      const ranked2 = indexer.rankCourses([courseA, courseB], 'rust');

      // Same order regardless of input order
      expect(ranked1[0].course.id).toBe('aaa');
      expect(ranked1[1].course.id).toBe('zzz');
      expect(ranked2[0].course.id).toBe('aaa');
      expect(ranked2[1].course.id).toBe('zzz');
    });

    it('filters out courses with score 0', () => {
      const match = makeCourse({ id: 'm1', title: 'Rust Course' });
      const noMatch = makeCourse({
        id: 'n1',
        title: 'Python Course',
        description: 'Python programming',
        tags: ['python'],
        categories: ['python'],
        category: 'python',
      });

      const ranked = indexer.rankCourses([noMatch, match], 'rust');
      expect(ranked).toHaveLength(1);
      expect(ranked[0].course.title).toBe('Rust Course');
    });
  });

  describe('reindexAll', () => {
    it('replaces the entire index atomically', () => {
      indexer.indexCourse(makeCourse({ id: 'old' }));
      const count = indexer.reindexAll([
        makeCourse({ id: 'new1' }),
        makeCourse({ id: 'new2' }),
      ]);
      expect(count).toBe(2);
      expect(indexer.size()).toBe(2);
      expect(indexer.getIndexedCourses().map((c) => c.id)).toEqual(
        expect.arrayContaining(['new1', 'new2']),
      );
    });

    it('records lastReindexAt timestamp', () => {
      expect(indexer.getLastReindexAt()).toBeNull();
      indexer.reindexAll([makeCourse()]);
      expect(indexer.getLastReindexAt()).toBeInstanceOf(Date);
    });
  });

  describe('getIndexedCourses', () => {
    it('returns a fresh copy that cannot mutate internal state', () => {
      indexer.indexCourse(makeCourse({ id: 'c1' }));
      const snapshot = indexer.getIndexedCourses();
      snapshot.push(makeCourse({ id: 'hacked' }));
      expect(indexer.size()).toBe(1);
    });
  });
});
