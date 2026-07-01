import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { CourseLevel } from './interfaces/course-level.enum';
import { CourseEntity } from './course.entity';

/**
 * Append-only, immutable snapshot of a course at a specific version.
 *
 * `CourseRevisionEntity` is the heart of the course versioning system.  Every
 * meaningful change to a course (create / update / restore) appends one row
 * here.  Rows are never updated after creation, so historical revisions
 * remain a true audit trail.  Of course (`CourseEntity`) → many revisions
 * relationship lives on this table.
 */
@Entity({ name: 'course_revisions' })
@Index(['courseId', 'version'], { unique: true })
export class CourseRevisionEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Index('idx_course_revisions_course_id')
  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ type: 'int' })
  version: number;

  /**
   * Immutable JSON snapshot of the editable course fields at this version.
   * Stored as `jsonb` so the structure can be queried/audited without an
   * additional relation table.
   */
  @Column({ type: 'jsonb' })
  snapshot: {
    title: string;
    description: string;
    level: CourseLevel;
    order: number;
    learningPathId: string;
    duration: number;
    category: string;
    categories: string[];
    tags: string[];
    prerequisites: string[];
    skills: string[];
    xpReward: number;
    isActive: boolean;
  };

  /** Optional human-readable summary of what changed */
  @Column({ name: 'change_note', type: 'text', nullable: true })
  changeNote?: string;

  /** Optional author/editor identifier who created this revision */
  @Column({ name: 'revision_author', type: 'varchar', length: 120, nullable: true })
  revisionAuthor?: string;

  /** Reason this revision was created (e.g. 'update', 'restore') */
  @Column({ type: 'varchar', length: 32 })
  reason: CourseRevisionReason;

  /**
   * Version that was active immediately before this revision, for traceability.
   * Null on the initial 'create' revision.
   */
  @Column({ name: 'previous_version', type: 'int', nullable: true })
  previousVersion?: number;

  /**
   * Optional pointer to the revision this one was derived from (e.g. a
   * `restore` revision that pulled content from a prior version).
   */
  @Column({
    name: 'reference_revision_id',
    type: 'uuid',
    nullable: true,
  })
  referenceRevisionId?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /**
   * Optional forward relation to the parent course. Modelled as a plain
   * indexed column without an FK constraint so the version history can
   * outlive a deleted course — the audit trail must remain queryable even
   * after the parent `CourseEntity` row is removed.
   */
  course?: CourseEntity;

  constructor(partial: Partial<CourseRevisionEntity> = {}) {
    Object.assign(this, partial);
    this.createdAt = this.createdAt || new Date();
    this.reason = this.reason || 'update';
  }
}

export type CourseRevisionReason = 'create' | 'update' | 'restore';
