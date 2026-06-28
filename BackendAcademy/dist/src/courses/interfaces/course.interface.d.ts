import { CourseLevel } from './course-level.enum';
export interface ICourse {
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
}
export interface ILesson {
    id: string;
    courseId: string;
    title: string;
    content: string;
    order: number;
    duration: number;
    xpReward: number;
}
export interface ITask {
    id: string;
    lessonId: string;
    title: string;
    description: string;
    difficulty: CourseLevel;
    testCases: string[];
    expectedOutput: string;
    xpReward: number;
    passingScore: number;
}
