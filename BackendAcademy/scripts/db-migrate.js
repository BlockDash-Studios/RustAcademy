const { spawnSync } = require('node:child_process');
const path = require('node:path');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required. Example: postgresql://user:password@localhost:5432/rustacademy');
  process.exit(1);
}

const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', path.join(__dirname, '..', 'database/migrations/001_gamification_chat.sql')], { stdio: 'inherit' });
process.exit(result.status ?? 1);
