import { CourseLevel } from './interfaces/course-level.enum';
export declare class CourseEntity {
    id: string;
    title: string;
    description: string;
    level: CourseLevel;
    order: number;
    learningPathId: string;
    duration: number;
    prerequisites: string[];
    skills: string[];
    xpReward: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    constructor(partial: Partial<CourseEntity>);
}
