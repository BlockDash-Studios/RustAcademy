import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
export declare class CourseController {
    private readonly courseService;
    constructor(courseService: CourseService);
    create(dto: CreateCourseDto): Promise<import("./course.entity").CourseEntity>;
    findAll(): Promise<import("./course.entity").CourseEntity[]>;
    findByLevel(level: string): Promise<import("./course.entity").CourseEntity[]>;
    findById(id: string): Promise<import("./course.entity").CourseEntity>;
    update(id: string, dto: UpdateCourseDto): Promise<import("./course.entity").CourseEntity>;
    remove(id: string): Promise<boolean>;
}
