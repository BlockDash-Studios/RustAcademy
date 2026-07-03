import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseRatingEntity } from './course-rating.entity';
import { CourseEntity } from './course.entity';
import { CreateRatingDto } from './dto/create-rating.dto';
import { CourseRatingStatsDto, RatingDistributionDto } from './dto/rating-stats.dto';

/**
 * Business logic for course ratings and reviews.
 *
 * Persistence is delegated to injected TypeORM repositories.
 * Each user can rate a course at most once; subsequent ratings update the existing one (upsert semantics).
 */
@Injectable()
export class CourseRatingService {
  constructor(
    @InjectRepository(CourseRatingEntity)
    private readonly ratingRepo: Repository<CourseRatingEntity>,
    @InjectRepository(CourseEntity)
    private readonly courseRepo: Repository<CourseEntity>,
  ) {}

  /**
   * Submit or update a rating for a course.
   * - If the user has not previously rated this course, creates a new rating.
   * - If the user has already rated this course, updates the existing rating.
   * Returns the saved rating entity.
   */
  async submitRating(
    courseId: string,
    userId: string,
    dto: CreateRatingDto,
  ): Promise<CourseRatingEntity> {
    // Verify course exists
    const course = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException({
        error: 'COURSE_NOT_FOUND',
        message: `Course with ID ${courseId} not found`,
      });
    }

    // Check if user already has a rating for this course
    let rating = await this.ratingRepo.findOne({
      where: { courseId, userId },
    });

    if (rating) {
      // Update existing rating (upsert)
      rating.rating = dto.rating;
      rating.review = dto.review ?? null;
      rating.updatedAt = new Date();
    } else {
      // Create new rating
      rating = this.ratingRepo.create({
        courseId,
        userId,
        rating: dto.rating,
        review: dto.review ?? null,
      });
    }

    return this.ratingRepo.save(rating);
  }

  /**
   * Retrieve all ratings for a course with pagination support.
   * Returns ratings ordered by most recent first, with reviewer info (no email).
   */
  async listRatings(
    courseId: string,
    page: number = 1,
    perPage: number = 20,
  ): Promise<{
    data: CourseRatingEntity[];
    total: number;
    page: number;
    perPage: number;
    pages: number;
  }> {
    // Verify course exists
    const course = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException({
        error: 'COURSE_NOT_FOUND',
        message: `Course with ID ${courseId} not found`,
      });
    }

    // Validate pagination params
    if (page < 1) page = 1;
    if (perPage < 1 || perPage > 100) perPage = 20;

    const skip = (page - 1) * perPage;

    const [data, total] = await this.ratingRepo.findAndCount({
      where: { courseId },
      order: { createdAt: 'DESC' },
      skip,
      take: perPage,
    });

    const pages = Math.ceil(total / perPage);

    return { data, total, page, perPage, pages };
  }

  /**
   * Get aggregated rating statistics for a course.
   * Returns average rating (to 2 decimal places), total count, and distribution.
   */
  async getRatingStats(courseId: string): Promise<CourseRatingStatsDto> {
    // Verify course exists
    const course = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException({
        error: 'COURSE_NOT_FOUND',
        message: `Course with ID ${courseId} not found`,
      });
    }

    // Get all ratings for this course
    const ratings = await this.ratingRepo.find({
      where: { courseId },
    });

    const totalRatings = ratings.length;
    const averageRating =
      totalRatings > 0
        ? Math.round(
            (ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings) *
              100,
          ) / 100
        : 0;

    // Calculate distribution
    const distribution: RatingDistributionDto = {
      oneStar: ratings.filter((r) => r.rating === 1).length,
      twoStar: ratings.filter((r) => r.rating === 2).length,
      threeStar: ratings.filter((r) => r.rating === 3).length,
      fourStar: ratings.filter((r) => r.rating === 4).length,
      fiveStar: ratings.filter((r) => r.rating === 5).length,
    };

    return {
      courseId,
      averageRating,
      totalRatings,
      ratingDistribution: distribution,
    };
  }

  /**
   * Delete a rating submitted by a user for a course.
   * Only allows a user to delete their own rating.
   * Returns true if a rating was deleted, false if no rating existed.
   */
  async deleteRating(courseId: string, userId: string): Promise<boolean> {
    const rating = await this.ratingRepo.findOne({
      where: { courseId, userId },
    });

    if (!rating) {
      // Return 404 without leaking existence
      throw new NotFoundException({
        error: 'RATING_NOT_FOUND',
        message: 'No rating found for this course',
      });
    }

    await this.ratingRepo.remove(rating);
    return true;
  }

  /**
   * Check if a specific user has rated a specific course.
   * Used internally for validation.
   */
  async hasUserRated(courseId: string, userId: string): Promise<boolean> {
    const rating = await this.ratingRepo.findOne({
      where: { courseId, userId },
    });
    return !!rating;
  }

  /**
   * Get a specific user's rating for a course (if it exists).
   */
  async getUserRating(
    courseId: string,
    userId: string,
  ): Promise<CourseRatingEntity | null> {
    return this.ratingRepo.findOne({
      where: { courseId, userId },
    });
  }
}
