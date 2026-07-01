import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('session_attendance')
@Index(['sessionKey', 'userId'], { unique: false })
export class AttendanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  sessionKey!: string;

  @Column({ type: 'varchar', length: 128 })
  userId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  joinedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  leftAt: Date | null = null;

  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null = null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}

