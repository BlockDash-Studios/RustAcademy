import { v4 as uuidv4 } from 'uuid';

export class LessonEntity {
  id: string;
  courseId: string;
  title: string;
  content: string;
  order: number;
  duration: number;
  xpReward: number;
  prerequisites: string[];
  version: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<LessonEntity>) {
    Object.assign(this, partial);
    this.id = this.id || uuidv4();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.isPublished = this.isPublished ?? false;
    this.prerequisites = this.prerequisites || [];
    this.xpReward = this.xpReward || 0;
    this.duration = this.duration || 0;
    this.version = this.version && this.version >= 1 ? this.version : 1;
  }
}
