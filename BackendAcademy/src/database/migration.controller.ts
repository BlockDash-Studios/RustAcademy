import { Controller, Get, Post, Query } from '@nestjs/common';
import { MigrationService, PreflightResult, RollbackResult } from './migration.service';

@Controller('api/migrations')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  /**
   * Runs preflight validation checks before applying migrations.
   */
  @Get('preflight')
  async preflight(): Promise<PreflightResult> {
    return this.migrationService.preflightCheck();
  }

  /**
   * Returns the rollback plan without executing it.
   */
  @Get('rollback-plan')
  getRollbackPlan(@Query('steps') steps?: string): {
    plan: ReturnType<MigrationService['getRollbackPlan']>;
  } {
    const stepCount = steps ? parseInt(steps, 10) : 5;
    return { plan: this.migrationService.getRollbackPlan(stepCount) };
  }

  /**
   * Rolls back the specified number of migrations.
   */
  @Post('rollback')
  async rollback(
    @Query('steps') steps?: string,
  ): Promise<RollbackResult> {
    const stepCount = steps ? parseInt(steps, 10) : 1;
    return this.migrationService.rollback(stepCount, false);
  }

  /**
   * Simulates a rollback without executing.
   */
  @Post('rollback/dry-run')
  async dryRunRollback(
    @Query('steps') steps?: string,
  ): Promise<RollbackResult> {
    const stepCount = steps ? parseInt(steps, 10) : 1;
    return this.migrationService.rollback(stepCount, true);
  }

  /**
   * Returns the migration history.
   */
  @Get('history')
  getHistory() {
    return { migrations: this.migrationService.getMigrationHistory() };
  }
}
