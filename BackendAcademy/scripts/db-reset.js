const { spawnSync } = require('node:child_process');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const sql = 'DROP TABLE IF EXISTS chat_reports, xp_ledger CASCADE;';
const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'inherit' });
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
process.exit(spawnSync(process.execPath, [require.resolve('./db-migrate.js')], { stdio: 'inherit', env: process.env }).status ?? 1);
