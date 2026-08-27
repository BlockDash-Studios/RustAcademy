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
  async getRollbackPlan(@Query('steps') steps?: string): Promise<{
    plan: Awaited<ReturnType<MigrationService['getRollbackPlan']>>;
  }> {
    const stepCount = steps ? parseInt(steps, 10) : 5;
    return { plan: await this.migrationService.getRollbackPlan(stepCount) };
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
  async getHistory() {
    return { migrations: await this.migrationService.getMigrationHistory() };
  }
}
