/**
 * Migration CLI helper.
 *
 * Provides command-line access to migration preflight validation,
 * rollback, and history inspection.
 *
 * Usage:
 *   pnpm migration:preflight
 *   pnpm migration:rollback [--steps=N] [--dry-run]
 *   pnpm migration:history
 *
 * This is a thin CLI wrapper around MigrationService for use in
 * CI/CD pipelines and manual deployments.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MigrationService } from './migration.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const migrationService = app.get(MigrationService);

  const command = process.argv[2] || 'preflight';
  const args = process.argv.slice(3);

  switch (command) {
    case 'preflight': {
      console.log('🔍 Running migration preflight checks...\n');
      const result = await migrationService.preflightCheck();

      for (const check of result.checks) {
        const icon =
          check.severity === 'error'
            ? '❌'
            : check.severity === 'warning'
              ? '⚠️'
              : '✅';
        console.log(`  ${icon} ${check.name}: ${check.message}`);
      }

      if (result.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        for (const rec of result.recommendations) {
          console.log(`  - ${rec}`);
        }
      }

      console.log(
        `\n📋 Rollback plan: ${result.rollbackPlan.length} step(s) available`,
      );
      for (const step of result.rollbackPlan.slice(0, 3)) {
        const rev = step.reversible ? '(reversible)' : '(⚠️ not reversible)';
        console.log(`  ${step.order}. ${step.action} ${rev}`);
      }

      console.log(
        `\n${result.success ? '✅ All preflight checks passed' : '❌ Some checks failed — review before proceeding'}`,
      );
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'rollback': {
      let steps = 1;
      let dryRun = false;
      for (const arg of args) {
        if (arg.startsWith('--steps=')) {
          steps = parseInt(arg.split('=')[1], 10) || 1;
        }
        if (arg === '--dry-run') {
          dryRun = true;
        }
      }

      console.log(
        `${dryRun ? '🔄 [DRY RUN] ' : '🔄 '}Rolling back ${steps} migration(s)...\n`,
      );
      const result = await migrationService.rollback(steps, dryRun);

      if (result.rolledBack.length > 0) {
        console.log('✅ Rolled back:');
        for (const name of result.rolledBack) {
          console.log(`  - ${name}`);
        }
      }

      if (result.failed.length > 0) {
        console.log('❌ Failed:');
        for (const name of result.failed) {
          console.log(`  - ${name}`);
        }
      }

      console.log(`\n${result.message}`);
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'history': {
      console.log('📜 Migration history:\n');
      const history = migrationService.getMigrationHistory();
      if (history.length === 0) {
        console.log('  No migrations recorded.');
      }
      for (const m of history) {
        const status = m.applied ? 'applied' : 'pending';
        console.log(`  ${m.applied ? '✅' : '⏳'} ${m.name} (${status} at ${m.timestamp.toISOString()})`);
      }
      break;
    }

    case 'dry-run': {
      console.log('🔄 [DRY RUN] Simulating rollback of 1 migration...\n');
      const result = await migrationService.rollback(1, true);
      console.log(result.message);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Available commands: preflight, rollback, history, dry-run');
      process.exit(1);
  }

  await app.close();
}

bootstrap().catch((err) => {
  console.error('Migration CLI error:', err);
  process.exit(1);
});
