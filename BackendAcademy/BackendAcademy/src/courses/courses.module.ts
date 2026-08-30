import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

/**
 * CoursesModule
 *
 * Groups together everything related to the "courses" feature:
 * the controller (handles HTTP requests) and the service (business logic).
 */
@Module({
  // Controllers that belong to this module and handle incoming requests
  controllers: [CoursesController],

  // Providers (services) available for dependency injection within this module
  providers: [CoursesService],

  // Providers exported so other modules can import and use CoursesService
  exports: [CoursesService],
})
export class CoursesModule {}
