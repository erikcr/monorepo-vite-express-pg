#!/usr/bin/env bash
set -euo pipefail

echo "Running migrations…"
node -e "
import('@repo/db').then(async ({ db }) => {
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  await migrate(db, { migrationsFolder: './migrations' });
  console.log('Migrations complete');
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
"

echo "Starting API server…"
exec node dist/index.js
