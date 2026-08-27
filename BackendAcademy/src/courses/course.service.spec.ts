import { NotFoundException } from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseEntity } from './course.entity';
import { CourseRevisionEntity } from './course-revision.entity';
import { CourseLevel } from './interfaces/course-level.enum';
import { TransactionManagerService } from '../common/transaction-manager.service';

import { RewardsService } from '../rewards/rewards.service';

/**
 * Minimal in-memory mock that imitates the subset of the
 * `Repository<T>` surface that `CourseService` relies on.  Tests construct
 * a fresh mock per `beforeEach` so the service runs in isolation.
 *
 * `create()` invokes the entity constructor (mirroring real TypeORM
 * behaviour) so defaults declared in the constructor — e.g.
 * `isActive ??= true` — still apply to rows stored by the mock.
 */
class InMemoryRepository<T extends { id: string }> {
  protected readonly rows: Map<string, T> = new Map();

  constructor(
    protected readonly EntityCtor?: new (partial?: Partial<T>) => T,
  ) {}

  create(partial: Partial<T> = {}): T {
    if (this.EntityCtor) {
      return new this.EntityCtor(partial);
    }
    return { ...(partial as T) };
  }

  async save(entity: T): Promise<T> {
    if (!entity.id) {
      (entity as T & { id: string }).id = crypto.randomUUID();
    }
    const now = new Date();
    if ('createdAt' in entity && !(entity as { createdAt?: Date }).createdAt) {
      (entity as { createdAt: Date }).createdAt = now;
    }
    if ('updatedAt' in entity) {
      (entity as { updatedAt: Date }).updatedAt = now;
    }
    this.rows.set((entity as T & { id: string }).id, entity);
    return entity;
  }

  async find(options: { where?: Partial<T>; order?: { version?: 'ASC' | 'DESC' } } = {}): Promise<T[]> {
    const matches = Object.values(this.matchRows(options.where ?? {}));
    if (options.order?.version) {
      matches.sort((a, b) => {
        const av = (a as unknown as { version: number }).version;
        const bv = (b as unknown as { version: number }).version;
        return options.order!.version === 'ASC' ? av - bv : bv - av;
      });
    }
    return matches;
  }

  async findOne(options: { where: Partial<T>; order?: { version?: 'ASC' | 'DESC' } }): Promise<T | null> {
    const [first] = Object.values(this.matchRows(options.where));
    if (first && options.order?.version) {
      const all = Object.values(this.matchRows(options.where));
      return all.sort((a, b) => {
        const av = (a as unknown as { version: number }).version;
        const bv = (b as unknown as { version: number }).version;
        return options.order!.version === 'ASC' ? av - bv : bv - av;
      })[0];
    }
    return first ?? null;
  }

  async remove(entity: T): Promise<T> {
    this.rows.delete((entity as T & { id: string }).id);
    return entity;
  }

  async count(options: { where?: Partial<T> } = {}): Promise<number> {
    return Object.values(this.matchRows(options.where ?? {})).length;
  }

  private matchRows(where: Partial<T>): Record<string, T> {
    const matches: Record<string, T> = {};
    for (const [id, row] of this.rows.entries()) {
      const ok = Object.entries(where as Record<string, unknown>).every(
        ([key, expected]) => {
          const actual = (row as Record<string, unknown>)[key];
          if (Array.isArray(expected)) {
            return Array.isArray(actual) &&
              expected.length === actual.length &&
              expected.every((v, i) => v === (actual as unknown[])[i]);
          }
          return actual === expected;
        },
      );
      if (ok) matches[id] = row;
    }
    return matches;
  }
}

class InMemoryCourseRepo extends InMemoryRepository<CourseEntity> {
  constructor() {
    super(CourseEntity);
  }
}
class InMemoryRevisionRepo extends InMemoryRepository<CourseRevisionEntity> {
  constructor() {
    super(CourseRevisionEntity);
  }
}

describe('CourseService', () => {
  let service: CourseService;
  let courseRepo: InMemoryCourseRepo;
  let revisionRepo: InMemoryRevisionRepo;
  let rewardsService: RewardsService;
  let searchIndexer: { indexCourse: jest.Mock; removeCourse: jest.Mock };
  let redisService: { invalidateContentCache: jest.Mock };

  beforeEach(() => {
    courseRepo = new InMemoryCourseRepo();
    revisionRepo = new InMemoryRevisionRepo();
    rewardsService = {
      recordActivity: jest.fn(),
    } as unknown as RewardsService;
    searchIndexer = {
      indexCourse: jest.fn(),
      removeCourse: jest.fn(),
    };
    redisService = {
      invalidateContentCache: jest.fn().mockResolvedValue(0),
    };
    service = new CourseService(
      courseRepo as unknown as import('typeorm').Repository<CourseEntity>,
      revisionRepo as unknown as import('typeorm').Repository<CourseRevisionEntity>,
      rewardsService,
      new TransactionManagerService(),
      undefined as any,
      undefined,
      searchIndexer as any,
      redisService as any,
    );
  });

  // ---------------------------------------------------------------------------
  // Soft-delete and restore lifecycle (#352)
  // ---------------------------------------------------------------------------

  it('soft-deletes a course by marking it inactive instead of removing the row', async () => {
    const course = await service.create({
      title: 'SoftDel',
      description: 'Desc',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });

    const removed = await service.remove(course.id);
    expect(removed).toBe(true);

    // Course is inactive but still findable by id
    const fetched = await service.findById(course.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.isActive).toBe(false);

    // Does NOT appear in active-only listings
    const all = await service.findAll();
    expect(all.map((c) => c.id)).not.toContain(course.id);

    // Revision history is preserved
    const revisions = await service.getRevisions(course.id);
    expect(revisions.length).toBeGreaterThanOrEqual(2);
    expect(revisions[revisions.length - 1].reason).toBe('update');
    expect(revisions[revisions.length - 1].changeNote).toBe('Course soft-deleted');
  });

  it('restores a soft-deleted course and records a restore revision', async () => {
    const course = await service.create({
      title: 'Restorable',
      description: 'Desc',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });

    await service.remove(course.id);
    const restored = await service.restoreCourse(course.id);

    expect(restored).not.toBeNull();
    expect(restored!.isActive).toBe(true);
    expect(restored!.version).toBe(3); // create + soft-delete + restore

    const all = await service.findAll();
    expect(all.map((c) => c.id)).toContain(course.id);

    const revisions = await service.getRevisions(course.id);
    expect(revisions[revisions.length - 1].reason).toBe('restore');
    expect(revisions[revisions.length - 1].changeNote).toBe('Course restored from soft-delete');
  });

  it('returns null when restoring a non-existent course', async () => {
    const result = await service.restoreCourse('ghost-course');
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Baseline CRUD behavior (unchanged from pre-versioning baseline)
  // ---------------------------------------------------------------------------

  it('creates a course at version 1 with an initial revision', async () => {
    const course = await service.create({
      title: 'Rust 101',
      description: 'Intro to Rust',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-rust',
      duration: 60,
      xpReward: 50,
    });

    expect(course.id).toBeDefined();
    expect(course.version).toBe(1);
    expect(course.latestRevisionId).toBeDefined();

    const revisions = await service.getRevisions(course.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].version).toBe(1);
    expect(revisions[0].reason).toBe('create');
    expect(revisions[0].snapshot.title).toBe('Rust 101');
  });

  it('generates normalized unique slugs on create', async () => {
    const first = await service.create({
      title: 'Rust 101: Ownership & Borrowing!',
      description: 'Intro to Rust',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-rust',
      duration: 60,
    });
    const second = await service.create({
      title: 'Rust 101 Ownership Borrowing',
      description: 'Another course',
      level: CourseLevel.BEGINNER,
      order: 2,
      learningPathId: 'path-rust',
      duration: 60,
    });

    expect(first.slug).toBe('rust-101-ownership-borrowing');
    expect(second.slug).toBe('rust-101-ownership-borrowing-2');
    expect(await service.findBySlugOrId(first.slug)).toBe(first);
  });

  it('regenerates the slug when a title changes', async () => {
    const course = await service.create({
      title: 'Original Title',
      description: 'Desc',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });

    const updated = await service.update(course.id, { title: 'A New Title' });

    expect(updated!.slug).toBe('a-new-title');
    expect(await service.findBySlugOrId('original-title')).toBeNull();
    expect(await service.findBySlugOrId('a-new-title')).toBe(updated);
  });

  it('returns only active courses from findAll()', async () => {
    const active = await service.create({
      title: 'Active',
      description: 'Active course',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });
    const inactive = await service.create({
      title: 'Inactive',
      description: 'Draft course',
      level: CourseLevel.BEGINNER,
      order: 2,
      learningPathId: 'path-1',
      duration: 30,
    });
    await service.update(inactive.id, { isActive: false });

    const all = await service.findAll();
    expect(all.map((c) => c.id)).toEqual([active.id]);
  });

  // ---------------------------------------------------------------------------
  // Versioning on update
  // ---------------------------------------------------------------------------

  it('increments version and appends a revision on each update', async () => {
    const course = await service.create({
      title: 'Title v1',
      description: 'Desc v1',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });
    expect(course.version).toBe(1);

    const updated = await service.update(course.id, {
      title: 'Title v2',
      changeNote: 'Tightened wording',
      revisionAuthor: 'editor-1',
    });
    expect(updated).not.toBeNull();
    expect(updated!.version).toBe(2);
    expect(updated!.title).toBe('Title v2');
    expect(updated!.latestRevisionId).toBeDefined();

    const updated2 = await service.update(course.id, {
      description: 'Desc v3',
      changeNote: 'Expanded goals',
      revisionAuthor: 'editor-2',
    });
    expect(updated2!.version).toBe(3);

    const revisions = await service.getRevisions(course.id);
    expect(revisions.map((r) => r.version)).toEqual([1, 2, 3]);
    expect(revisions[1].changeNote).toBe('Tightened wording');
    expect(revisions[1].revisionAuthor).toBe('editor-1');
    expect(revisions[1].reason).toBe('update');
    expect(revisions[1].previousVersion).toBe(1);
    expect(revisions[2].snapshot.title).toBe('Title v2'); // carries forward previous edits
    expect(revisions[2].snapshot.description).toBe('Desc v3');
  });

  it('updates latestRevisionId to point at the most recent revision', async () => {
    const course = await service.create({
      title: 'Token Test',
      description: 'Test',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });
    const firstLatestId = course.latestRevisionId;

    const updated = await service.update(course.id, { title: 'Token Test 2' });
    expect(updated!.latestRevisionId).not.toEqual(firstLatestId);

    const latest = await service.getLatestRevision(course.id);
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(updated!.latestRevisionId);
    expect(latest!.snapshot.title).toBe('Token Test 2');
  });

  it('preserves a deep copy of the snapshot so later updates do not mutate history', async () => {
    const course = await service.create({
      title: 'Snapshot Test',
      description: 'Desc',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
      prerequisites: ['rust-basics'],
    });
    await service.update(course.id, {
      prerequisites: ['rust-basics', 'ownership'],
      skills: ['borrowing'],
    });

    const revisions = await service.getRevisions(course.id);
    expect(revisions[0].snapshot.prerequisites).toEqual(['rust-basics']);
    expect(revisions[1].snapshot.prerequisites).toEqual([
      'rust-basics',
      'ownership',
    ]);
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Taxonomy normalization (BA-047)
  // ---------------------------------------------------------------------------

  it('normalizes free-text fields on create', async () => {
    const course = await service.create({
      title: '  Rust   Basics  ',
      description: '  An intro to Rust.  ',
      level: 'INTERMEDIATE' as CourseLevel,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });

    expect(course.title).toBe('Rust Basics');
    expect(course.description).toBe('An intro to Rust.');
    expect(course.level).toBe(CourseLevel.INTERMEDIATE);
    expect(course.slug).toBe('rust-basics');
  });

  it('canonicalizes taxonomy arrays (trim, lowercase, dedupe, drop blanks) on create', async () => {
    const course = await service.create({
      title: 'Rust Basics',
      description: 'An intro',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
      category: 'WASM',
      categories: ['WASM', '  Rust ', 'Rust', '  '],
      tags: [' Ownership ', 'ownership'],
      prerequisites: ['  borrowed ', 'lifetimes'],
      skills: ['Memory Safety', 'memory safety'],
    });

    expect(course.category).toBe('wasm');
    expect(course.categories).toEqual(['wasm', 'rust']);
    expect(course.tags).toEqual(['ownership']);
    expect(course.prerequisites).toEqual(['borrowed', 'lifetimes']);
    expect(course.skills).toEqual(['memory safety']);
  });

  it('normalizes taxonomy fields on update only when provided', async () => {
    const course = await service.create({
      title: 'Rust Basics',
      description: 'An intro',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
      tags: [' original '],
      prerequisites: ['stay'],
    });

    const updated = await service.update(course.id, { skills: [' WASM ', 'wasm'] });

    // Fields that were not part of the update payload must be untouched.
    expect(updated!.tags).toEqual(['original']);
    expect(updated!.prerequisites).toEqual(['stay']);
    // Provided taxonomy is canonicalized.
    expect(updated!.skills).toEqual(['wasm']);
  });

  it('keeps the canonical title bound reflected in the persisted slug on update', async () => {
    const course = await service.create({
      title: 'Rust Basics',
      description: 'An intro',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });

    const updated = await service.update(course.id, { title: ' Rust   Advanced ' });
    expect(updated!.title).toBe('Rust Advanced');
    expect(updated!.slug).toBe('rust-advanced');
  });

  // Revision lookup
  // ---------------------------------------------------------------------------

  it('returns the correct revision by version', async () => {
    const course = await service.create({
      title: 'Lookup',
      description: 'Desc',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });
    await service.update(course.id, { title: 'Lookup v2' });

    const v1 = await service.getRevisionByVersion(course.id, 1);
    const v2 = await service.getRevisionByVersion(course.id, 2);

    expect(v1).not.toBeNull();
    expect(v1!.snapshot.title).toBe('Lookup');
    expect(v2).not.toBeNull();
    expect(v2!.snapshot.title).toBe('Lookup v2');
  });

  it('returns null for a missing revision version', async () => {
    const course = await service.create({
      title: 'MissingVersion',
      description: 'Desc',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });
    const result = await service.getRevisionByVersion(course.id, 99);
    expect(result).toBeNull();
  });

  it('returns an empty array when listing revisions for an unknown course', async () => {
    const revisions = await service.getRevisions('non-existent');
    expect(revisions).toEqual([]);
    expect(await service.getRevisionByVersion('non-existent', 1)).toBeNull();
    expect(await service.getRevisionCount('non-existent')).toBe(0);
    expect(await service.getLatestRevision('non-existent')).toBeNull();
  });

  it('throws NotFoundException for non-positive revision versions', async () => {
    const course = await service.create({
      title: 'BadVersion',
      description: 'Desc',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });
    await expect(service.getRevisionByVersion(course.id, 0)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getRevisionByVersion(course.id, -1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('counts the number of revisions correctly', async () => {
    const course = await service.create({
      title: 'Counter',
      description: 'Desc',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });
    expect(await service.getRevisionCount(course.id)).toBe(1);
    await service.update(course.id, { title: 'Counter v2' });
    expect(await service.getRevisionCount(course.id)).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Restore behavior
  // ---------------------------------------------------------------------------

  it('restores a course to a previous version and records a new revision', async () => {
    const course = await service.create({
      title: 'Original',
      description: 'Original desc',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
      prerequisites: [],
    });
    await service.update(course.id, {
      title: 'Second',
      description: 'Second desc',
      prerequisites: ['pre-1'],
    });
    await service.update(course.id, {
      title: 'Third',
      description: 'Third desc',
      prerequisites: ['pre-1', 'pre-2'],
    });

    const restored = await service.restoreRevision(
      course.id,
      1,
      'editor-restore',
    );
    expect(restored).not.toBeNull();
    expect(restored!.title).toBe('Original');
    expect(restored!.description).toBe('Original desc');
    expect(restored!.prerequisites).toEqual([]);
    // Restoring bumps the version forward (append-only history)
    expect(restored!.version).toBe(4);

    const revisions = await service.getRevisions(course.id);
    expect(revisions.map((r) => r.version)).toEqual([1, 2, 3, 4]);
    expect(revisions[3].reason).toBe('restore');
    expect(revisions[3].changeNote).toBe('Restored from version 1');
    expect(revisions[3].revisionAuthor).toBe('editor-restore');
    expect(revisions[3].previousVersion).toBe(3);
    expect(revisions[3].referenceRevisionId).toBe(revisions[0].id);
  });

  it('throws NotFoundException when restoring a course that does not exist', async () => {
    await expect(service.restoreRevision('ghost-course', 1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when restoring from a non-existent revision', async () => {
    const course = await service.create({
      title: 'RestoreFail',
      description: 'Desc',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });
    await expect(service.restoreRevision(course.id, 99)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ---------------------------------------------------------------------------
  // Removal preserves revision history
  // ---------------------------------------------------------------------------

  it('soft-deletes a course and keeps its revision history queryable for audit', async () => {
    const course = await service.create({
      title: 'ToDelete',
      description: 'Desc',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });

    expect(await service.remove(course.id)).toBe(true);

    // The course is inactive but still present (soft-delete)
    const fetched = await service.findById(course.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.isActive).toBe(false);

    // Revision history is preserved — both the initial create and
    // the soft-delete revision exist.
    const revisions = await service.getRevisions(course.id);
    expect(revisions).toHaveLength(2);
    expect(revisions[0].snapshot.title).toBe('ToDelete');
    expect(revisions[0].reason).toBe('create');
    expect(revisions[1].reason).toBe('update');
    expect(revisions[1].changeNote).toBe('Course soft-deleted');
    expect(await service.getRevisionByVersion(course.id, 1)).not.toBeNull();
    expect(await service.getRevisionCount(course.id)).toBe(2);
  });
});