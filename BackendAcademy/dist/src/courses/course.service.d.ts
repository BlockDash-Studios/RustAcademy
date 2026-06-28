import { CourseEntity } from './course.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
export declare class CourseService {
    private readonly courses;
    create(dto: CreateCourseDto): Promise<CourseEntity>;
    findAll(): Promise<CourseEntity[]>;
    findByLevel(level: string): Promise<CourseEntity[]>;
    findById(id: string): Promise<CourseEntity | null>;
    update(id: string, dto: UpdateCourseDto): Promise<CourseEntity | null>;
    remove(id: string): Promise<boolean>;
}
