/**
 * Run all SQL migrations in order against the DATABASE_URL.
 *
 * Each migration file is executed sequentially so that foreign-key dependencies
 * (e.g. lessons → courses in 002) are resolved before they are referenced.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required. Example: postgresql://user:password@localhost:5432/rustacademy');
  process.exit(1);
}

const migrations = [
  'database/migrations/001_gamification_chat.sql',
  'database/migrations/002_courses_prerequisites.sql',
];

for (const migration of migrations) {
  const filePath = path.join(__dirname, '..', migration);
  console.log(`Running migration: ${migration}`);
  const result = spawnSync(
    'psql',
    [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', filePath],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    console.error(`Migration failed: ${migration}`);
    process.exit(result.status ?? 1);
  }
}

console.log('All migrations completed successfully.');
