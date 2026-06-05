#!/usr/bin/env bash
set -euo pipefail

echo "Running migrations…"
node dist/migrate.js

echo "Starting API server…"
exec node dist/index.js
