import { Controller, Get, Param, ValidationPipe, UsePipes } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * Returns all registered cron schedules with their validation status
   * and approximated next-run times.
   */
  @Get('schedules')
  getAllSchedules() {
    return {
      schedules: this.jobsService.getAllSchedules(),
      total: this.jobsService.getAllSchedules().length,
    };
  }

  /**
   * Returns a single schedule by name.
   */
  @Get('schedules/:name')
  @UsePipes(new ValidationPipe({ transform: true }))
  getSchedule(@Param('name') name: string) {
    return this.jobsService.getSchedule(name) ?? {
      error: `No schedule found for "${name}"`,
    };
  }

  /**
   * Validates all registered schedules and returns the results.
   */
  @Get('validate')
  validateAll() {
    return {
      results: this.jobsService.validateAll(),
    };
  }
}
