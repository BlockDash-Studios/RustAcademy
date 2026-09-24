const { spawnSync } = require('node:child_process');
const path = require('node:path');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', path.join(__dirname, '..', 'database/seed/001_reference_data.sql')], { stdio: 'inherit' });
process.exit(result.status ?? 1);
