import { NotFoundException } from '@nestjs/common';
import { CourseRatingService } from './course-rating.service';
import { CourseRatingEntity } from './course-rating.entity';
import { CourseEntity } from './course.entity';
import { CourseLevel } from './interfaces/course-level.enum';
import { CreateRatingDto } from './dto/create-rating.dto';

/**
 * Minimal in-memory mock that imitates the subset of the Repository<T> surface
 * that CourseRatingService relies on.
 */
class InMemoryRepository<T extends { id?: string | number }> {
  protected readonly rows: Map<string | number, T> = new Map();
  private nextId = 1;

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
      (entity as T & { id: number }).id = this.nextId++;
    }
    const now = new Date();
    if ('createdAt' in entity && !(entity as { createdAt?: Date }).createdAt) {
      (entity as { createdAt: Date }).createdAt = now;
    }
    if ('updatedAt' in entity) {
      (entity as { updatedAt: Date }).updatedAt = now;
    }
    this.rows.set((entity as T & { id: string | number }).id, entity);
    return entity;
  }

  async find(options: {
    where?: Partial<T>;
    order?: { createdAt?: 'DESC' | 'ASC' };
    skip?: number;
    take?: number;
  } = {}): Promise<T[]> {
    const matches = Object.values(this.matchRows(options.where ?? {}));
    if (options.order?.createdAt) {
      matches.sort((a, b) => {
        const aTime = (a as { createdAt: Date }).createdAt?.getTime() ?? 0;
        const bTime = (b as { createdAt: Date }).createdAt?.getTime() ?? 0;
        return options.order!.createdAt === 'DESC' ? bTime - aTime : aTime - bTime;
      });
    }
    const skip = options.skip ?? 0;
    const take = options.take ?? matches.length;
    return matches.slice(skip, skip + take);
  }

  async findOne(options: { where: Partial<T> }): Promise<T | null> {
    const matches = Object.values(this.matchRows(options.where));
    return matches[0] ?? null;
  }

  async findAndCount(options: {
    where?: Partial<T>;
    order?: { createdAt?: 'DESC' | 'ASC' };
    skip?: number;
    take?: number;
  } = {}): Promise<[T[], number]> {
    const all = Object.values(this.matchRows(options.where ?? {}));
    const total = all.length;

    if (options.order?.createdAt) {
      all.sort((a, b) => {
        const aTime = (a as { createdAt: Date }).createdAt?.getTime() ?? 0;
        const bTime = (b as { createdAt: Date }).createdAt?.getTime() ?? 0;
        return options.order!.createdAt === 'DESC' ? bTime - aTime : aTime - bTime;
      });
    }

    const skip = options.skip ?? 0;
    const take = options.take ?? total;
    const data = all.slice(skip, skip + take);

    return [data, total];
  }

  async remove(entity: T): Promise<T> {
    const id = (entity as T & { id: string | number }).id;
    this.rows.delete(id);
    return entity;
  }

  private matchRows(where: Partial<T>): Record<string | number, T> {
    const matches: Record<string | number, T> = {};
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

class InMemoryRatingRepo extends InMemoryRepository<CourseRatingEntity> {
  constructor() {
    super(CourseRatingEntity);
  }
}

class InMemoryCourseRepo extends InMemoryRepository<CourseEntity> {
  constructor() {
    super(CourseEntity);
  }

  async findOne(options: { where: { id: string } }): Promise<CourseEntity | null> {
    const id = options.where.id;
    return this.rows.get(id) as CourseEntity | undefined ?? null;
  }
}

describe('CourseRatingService', () => {
  let service: CourseRatingService;
  let ratingRepo: InMemoryRatingRepo;
  let courseRepo: InMemoryCourseRepo;
  let testCourseId: string;
  let learnerId: string;
  let userId2: string;

  beforeEach(async () => {
    ratingRepo = new InMemoryRatingRepo();
    courseRepo = new InMemoryCourseRepo();
    service = new CourseRatingService(
      ratingRepo as unknown as import('typeorm').Repository<CourseRatingEntity>,
      courseRepo as unknown as import('typeorm').Repository<CourseEntity>,
    );

    // Create a test course
    testCourseId = crypto.randomUUID();
    learnerId = crypto.randomUUID();
    userId2 = crypto.randomUUID();

    const course = new CourseEntity({
      id: testCourseId,
      title: 'Test Course',
      description: 'A test course',
      level: CourseLevel.BEGINNER,
      order: 1,
      learningPathId: 'path-1',
      duration: 30,
    });
    await courseRepo.save(course);
  });

  // ---------------------------------------------------------------------------
  // Submit Rating Tests
  // ---------------------------------------------------------------------------

  it('should create a new rating when user has not rated the course', async () => {
    const dto: CreateRatingDto = { rating: 5, review: 'Great course!' };
    const result = await service.submitRating(testCourseId, learnerId, dto);

    expect(result).toBeDefined();
    expect(result.courseId).toBe(testCourseId);
    expect(result.userId).toBe(learnerId);
    expect(result.rating).toBe(5);
    expect(result.review).toBe('Great course!');
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  it('should update existing rating when user has already rated the course', async () => {
    const dto1: CreateRatingDto = { rating: 3, review: 'Good' };
    const rating1 = await service.submitRating(testCourseId, learnerId, dto1);
    const initialId = rating1.id;
    const createdAtTime = rating1.createdAt.getTime();

    // Wait a tiny bit to ensure updatedAt changes
    await new Promise((resolve) => setTimeout(resolve, 10));

    const dto2: CreateRatingDto = { rating: 5, review: 'Excellent!' };
    const rating2 = await service.submitRating(testCourseId, learnerId, dto2);

    // Same ID (upsert, not insert)
    expect(rating2.id).toBe(initialId);
    expect(rating2.rating).toBe(5);
    expect(rating2.review).toBe('Excellent!');
    expect(rating2.createdAt.getTime()).toBe(createdAtTime);
    expect(rating2.updatedAt.getTime()).toBeGreaterThan(createdAtTime);

    // Verify only one rating exists in DB
    const allRatings = await ratingRepo.find({ where: { courseId: testCourseId } });
    expect(allRatings).toHaveLength(1);
  });

  it('should accept rating without review', async () => {
    const dto: CreateRatingDto = { rating: 4 };
    const result = await service.submitRating(testCourseId, learnerId, dto);

    expect(result.rating).toBe(4);
    expect(result.review).toBeNull();
  });

  it('should reject rating for non-existent course', async () => {
    const fakeCourseId = crypto.randomUUID();
    const dto: CreateRatingDto = { rating: 5 };

    await expect(
      service.submitRating(fakeCourseId, learnerId, dto),
    ).rejects.toThrow(NotFoundException);
  });

  // ---------------------------------------------------------------------------
  // List Ratings Tests
  // ---------------------------------------------------------------------------

  it('should list ratings for a course with pagination', async () => {
    // Insert 25 ratings
    for (let i = 0; i < 25; i++) {
      const userId = crypto.randomUUID();
      const dto: CreateRatingDto = { rating: (i % 5) + 1 };
      await service.submitRating(testCourseId, userId, dto);
    }

    // Get first page (default: 20 per page)
    const page1 = await service.listRatings(testCourseId, 1, 20);
    expect(page1.data).toHaveLength(20);
    expect(page1.total).toBe(25);
    expect(page1.page).toBe(1);
    expect(page1.perPage).toBe(20);
    expect(page1.pages).toBe(2);

    // Get second page
    const page2 = await service.listRatings(testCourseId, 2, 20);
    expect(page2.data).toHaveLength(5);
    expect(page2.page).toBe(2);

    // Verify no overlap
    const page1Ids = page1.data.map((r) => r.id);
    const page2Ids = page2.data.map((r) => r.id);
    expect(new Set([...page1Ids, ...page2Ids])).toHaveSize(25);
  });

  it('should default pagination parameters correctly', async () => {
    const dto: CreateRatingDto = { rating: 5 };
    await service.submitRating(testCourseId, learnerId, dto);

    const result = await service.listRatings(testCourseId);
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
    expect(result.pages).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('should clamp invalid pagination parameters', async () => {
    const dto: CreateRatingDto = { rating: 5 };
    for (let i = 0; i < 5; i++) {
      await service.submitRating(testCourseId, crypto.randomUUID(), dto);
    }

    // Negative page → 1
    const badPage = await service.listRatings(testCourseId, -5, 10);
    expect(badPage.page).toBe(1);

    // perPage > 100 → 20
    const badPerPage = await service.listRatings(testCourseId, 1, 200);
    expect(badPerPage.perPage).toBe(20);
  });

  it('should throw NotFoundException for non-existent course', async () => {
    const fakeCourseId = crypto.randomUUID();
    await expect(service.listRatings(fakeCourseId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return empty list for course with no ratings', async () => {
    const result = await service.listRatings(testCourseId);
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.pages).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Rating Stats Tests
  // ---------------------------------------------------------------------------

  it('should calculate correct average rating', async () => {
    // Insert ratings: 5, 4, 3
    await service.submitRating(testCourseId, crypto.randomUUID(), {
      rating: 5,
    });
    await service.submitRating(testCourseId, crypto.randomUUID(), {
      rating: 4,
    });
    await service.submitRating(testCourseId, crypto.randomUUID(), {
      rating: 3,
    });

    const stats = await service.getRatingStats(testCourseId);
    expect(stats.averageRating).toBe(4); // (5+4+3)/3 = 4
    expect(stats.totalRatings).toBe(3);
    expect(stats.courseId).toBe(testCourseId);
  });

  it('should return correct rating distribution', async () => {
    // Insert: 1×1-star, 2×2-star, 3×3-star, 4×4-star, 5×5-star
    await service.submitRating(testCourseId, crypto.randomUUID(), { rating: 1 });
    for (let i = 0; i < 2; i++)
      await service.submitRating(testCourseId, crypto.randomUUID(), {
        rating: 2,
      });
    for (let i = 0; i < 3; i++)
      await service.submitRating(testCourseId, crypto.randomUUID(), {
        rating: 3,
      });
    for (let i = 0; i < 4; i++)
      await service.submitRating(testCourseId, crypto.randomUUID(), {
        rating: 4,
      });
    for (let i = 0; i < 5; i++)
      await service.submitRating(testCourseId, crypto.randomUUID(), {
        rating: 5,
      });

    const stats = await service.getRatingStats(testCourseId);
    expect(stats.ratingDistribution.oneStar).toBe(1);
    expect(stats.ratingDistribution.twoStar).toBe(2);
    expect(stats.ratingDistribution.threeStar).toBe(3);
    expect(stats.ratingDistribution.fourStar).toBe(4);
    expect(stats.ratingDistribution.fiveStar).toBe(5);
  });

  it('should round average rating to 2 decimal places', async () => {
    // Insert ratings: 5, 5, 4 → average = 4.666... → 4.67
    await service.submitRating(testCourseId, crypto.randomUUID(), { rating: 5 });
    await service.submitRating(testCourseId, crypto.randomUUID(), { rating: 5 });
    await service.submitRating(testCourseId, crypto.randomUUID(), { rating: 4 });

    const stats = await service.getRatingStats(testCourseId);
    expect(stats.averageRating).toBe(4.67);
  });

  it('should return 0 average for course with no ratings', async () => {
    const stats = await service.getRatingStats(testCourseId);
    expect(stats.averageRating).toBe(0);
    expect(stats.totalRatings).toBe(0);
    expect(stats.ratingDistribution.oneStar).toBe(0);
    expect(stats.ratingDistribution.fiveStar).toBe(0);
  });

  it('should throw NotFoundException for non-existent course', async () => {
    const fakeCourseId = crypto.randomUUID();
    await expect(service.getRatingStats(fakeCourseId)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ---------------------------------------------------------------------------
  // Delete Rating Tests
  // ---------------------------------------------------------------------------

  it('should delete a user rating', async () => {
    const dto: CreateRatingDto = { rating: 5, review: 'Great!' };
    await service.submitRating(testCourseId, learnerId, dto);

    // Verify rating exists
    let rating = await service.getUserRating(testCourseId, learnerId);
    expect(rating).not.toBeNull();

    // Delete it
    const deleted = await service.deleteRating(testCourseId, learnerId);
    expect(deleted).toBe(true);

    // Verify it's gone
    rating = await service.getUserRating(testCourseId, learnerId);
    expect(rating).toBeNull();
  });

  it('should throw NotFoundException when deleting non-existent rating', async () => {
    // No rating submitted yet
    await expect(service.deleteRating(testCourseId, learnerId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should only delete own rating (upsert test)', async () => {
    // User 1 submits a rating
    await service.submitRating(testCourseId, learnerId, { rating: 5 });

    // User 2 tries to delete User 1's rating → should fail
    await expect(service.deleteRating(testCourseId, userId2)).rejects.toThrow(
      NotFoundException,
    );

    // User 1's rating should still exist
    const rating = await service.getUserRating(testCourseId, learnerId);
    expect(rating).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Helper Methods Tests
  // ---------------------------------------------------------------------------

  it('should check if user has rated course', async () => {
    const hasRated1 = await service.hasUserRated(testCourseId, learnerId);
    expect(hasRated1).toBe(false);

    await service.submitRating(testCourseId, learnerId, { rating: 4 });

    const hasRated2 = await service.hasUserRated(testCourseId, learnerId);
    expect(hasRated2).toBe(true);
  });

  it('should retrieve specific user rating', async () => {
    const ratingBefore = await service.getUserRating(testCourseId, learnerId);
    expect(ratingBefore).toBeNull();

    const submitted = await service.submitRating(testCourseId, learnerId, {
      rating: 3,
      review: 'Okay',
    });

    const retrieved = await service.getUserRating(testCourseId, learnerId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(submitted.id);
    expect(retrieved!.rating).toBe(3);
    expect(retrieved!.review).toBe('Okay');
  });

  // ---------------------------------------------------------------------------
  // Validation Tests (via DTOs)
  // ---------------------------------------------------------------------------

  it('should support multiple users rating the same course independently', async () => {
    const userIds = Array.from({ length: 5 }, () => crypto.randomUUID());
    for (let i = 0; i < 5; i++) {
      await service.submitRating(testCourseId, userIds[i], { rating: i + 1 });
    }

    const stats = await service.getRatingStats(testCourseId);
    expect(stats.totalRatings).toBe(5);
    // Average = (1+2+3+4+5)/5 = 3
    expect(stats.averageRating).toBe(3);
  });

  it('should preserve review text exactly as submitted', async () => {
    const reviewText = 'This course is amazing!\n\nI learned so much.';
    await service.submitRating(testCourseId, learnerId, {
      rating: 5,
      review: reviewText,
    });

    const rating = await service.getUserRating(testCourseId, learnerId);
    expect(rating!.review).toBe(reviewText);
  });
});
