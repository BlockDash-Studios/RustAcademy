import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A learner's rating and optional review for a course.
 *
 * Each user can rate a course at most once; submitting a new rating
 * will update the existing one (upsert semantics).
 */
@Entity({ name: 'course_ratings' })
@Index(['courseId', 'userId'], { unique: true })
export class CourseRatingEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Index('idx_course_ratings_course_id')
  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Index('idx_course_ratings_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /**
   * Rating value from 1 to 5 (inclusive).
   * Stored as SMALLINT with a CHECK constraint in the migration.
   */
  @Column({ type: 'smallint' })
  rating: number;

  /**
   * Optional text review from the learner.
   * Max 2000 characters.
   */
  @Column({ type: 'text', nullable: true })
  review: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  constructor(partial: Partial<CourseRatingEntity> = {}) {
    Object.assign(this, partial);
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.review = this.review || null;
  }
}
