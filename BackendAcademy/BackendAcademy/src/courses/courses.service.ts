import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

/**
 * CoursesService
 *
 * Contains the business logic for managing courses (CRUD operations).
 * Currently uses stub/placeholder logic; real persistence (e.g. via a
 * repository or ORM) still needs to be implemented.
 */
@Injectable()
export class CoursesService {
  /**
   * Creates a new course.
   * TODO: persist the course via a repository instead of just returning it.
   */
  create(dto: CreateCourseDto) {
    // TODO: persist via repository
    // Temporary: fake an id using the current timestamp
    return { ...dto, id: Date.now() };
  }

  /**
   * Retrieves all courses.
   * TODO: fetch the list from a repository/database.
   */
  findAll() {
    // TODO: query repository
    // Temporary: no data source yet, so return an empty array
    return [];
  }

  /**
   * Retrieves a single course by id.
   * TODO: fetch the course from a repository/database.
   * Throws a NotFoundException if the course doesn't exist.
   */
  findOne(id: number) {
    // TODO: query repository
    // Temporary: no data source yet, so this is always null
    const course = null;

    // Guard clause: bail out with a 404-style error if nothing was found
    if (!course) throw new NotFoundException(`Course #${id} not found`);

    return course;
  }

  /**
   * Updates an existing course by id.
   * TODO: look up the existing course, then persist the merged changes.
   */
  update(id: number, dto: UpdateCourseDto) {
    // TODO: query then persist
    // Temporary: just echo back the id and updated fields
    return { id, ...dto };
  }

  /**
   * Removes a course by id.
   * TODO: actually delete the record from the repository/database.
   */
  remove(id: number) {
    // TODO: delete from repository
    // Temporary: just acknowledge the deletion request
    return { deleted: id };
  }
}
