import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CourseLevel } from './interfaces/course-level.enum';
import { CourseRevisionEntity } from './course-revision.entity';

/**
 * Postgres-backed Course entity.
 *
 * `CourseEntity` is the canonical, mutable representation of a course that is
 * currently being served to learners.  Every update to the course should also
 * append an immutable entry to the `course_revisions` table (see
 * `CourseRevisionEntity`) so the full version history is preserved.
 */
@Entity({ name: 'courses' })
export class CourseEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: CourseLevel })
  level: CourseLevel;

  @Column({ type: 'int' })
  order: number;

  @Index('idx_courses_learning_path_id')
  @Column({ name: 'learning_path_id', type: 'uuid' })
  learningPathId: string;

  @Column({ type: 'int' })
  duration: number;

  @Column({ type: 'varchar', length: 120, default: 'general' })
  category: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  categories: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  prerequisites: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  skills: string[];

  @Column({ name: 'xp_reward', type: 'int', default: 0 })
  xpReward: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Monotonically increasing version that mirrors the latest revision's
   * version.  Kept on the row itself so callers can compare current state
   * to a known revision without an extra join.
   */
  @Column({ type: 'int', default: 1 })
  version: number;

  /**
   * Pointer to the most recent `CourseRevisionEntity.id` for this course.
   * Modelled as a plain nullable UUID column to avoid circular foreign-key
   * constraints during inserts.
   */
  @Column({
    name: 'latest_revision_id',
    type: 'uuid',
    nullable: true,
  })
  latestRevisionId?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /**
   * Reverse relation: the full version history for this course.  Not a
   * database column — TypeORM populates it from the `course_revisions` table
   * when explicitly queried.
   */
  @OneToMany(() => CourseRevisionEntity, (revision) => revision.course)
  revisions?: CourseRevisionEntity[];

  constructor(partial: Partial<CourseEntity> = {}) {
    Object.assign(this, partial);
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.isActive = this.isActive ?? true;
    this.category = this.category || this.categories?.[0] || 'general';
    this.categories = this.categories || [this.category];
    this.tags = this.tags || [];
    this.prerequisites = this.prerequisites || [];
    this.skills = this.skills || [];
    // Object.assign above already copies version; default to 1 when absent.
    this.version ??= 1;
  }
}
