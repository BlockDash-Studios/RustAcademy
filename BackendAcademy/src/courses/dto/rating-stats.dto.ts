/**
 * Distribution of ratings (1 to 5 stars).
 */
export class RatingDistributionDto {
  oneStar: number;
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
}

/**
 * Aggregated rating statistics for a course.
 */
export class CourseRatingStatsDto {
  courseId: string;
  averageRating: number;
  totalRatings: number;
  ratingDistribution: RatingDistributionDto;
}
