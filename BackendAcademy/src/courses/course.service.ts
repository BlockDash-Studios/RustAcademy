import { Injectable, NotFoundException } from '@nestjs/common';
import { CourseEntity } from './course.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { RewardsService } from '../rewards/rewards.service';

@Injectable()
export class CourseService {
  private readonly courses: Map<string, CourseEntity> = new Map();

  constructor(private readonly rewardsService: RewardsService) {}

  async create(dto: CreateCourseDto): Promise<CourseEntity> {
    const course = new CourseEntity({
      id: crypto.randomUUID(),
      ...dto,
    });
    this.courses.set(course.id, course);
    return course;
  }

  async findAll(): Promise<CourseEntity[]> {
    return Array.from(this.courses.values()).filter(c => c.isActive);
  }

  async findByLevel(level: string): Promise<CourseEntity[]> {
    return Array.from(this.courses.values()).filter(
      c => c.isActive && c.level === level,
    );
  }

  async findById(id: string): Promise<CourseEntity | null> {
    return this.courses.get(id) || null;
  }

  async update(id: string, dto: UpdateCourseDto): Promise<CourseEntity | null> {
    const course = this.courses.get(id);
    if (!course) return null;
    Object.assign(course, dto, { updatedAt: new Date() });
    return course;
  }

  async remove(id: string): Promise<boolean> {
    return this.courses.delete(id);
  }

  async completeCourse(id: string, userId: string) {
    const course = this.courses.get(id);
    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found.`);
    }
    
    // Reward the user for completing the course
    const xpReward = course.xpReward || 50; // Default to 50 XP if not specified
    const result = this.rewardsService.recordActivity(userId, new Date(), xpReward);
    
    return {
      message: 'Course completed successfully',
      courseId: id,
      userId,
      xpAwarded: xpReward,
      progression: result,
    };
  }
}
