#!/bin/sh
set -eu
if [ -z "${NEXTAUTH_SECRET:-}" ] || [ "${#NEXTAUTH_SECRET}" -lt 32 ]; then
  echo "Set NEXTAUTH_SECRET to a random value of at least 32 characters." >&2
  exit 1
fi
mkdir -p /app/db /app/public/uploads
# Stop on unsafe schema changes or database errors; never accept data loss.
node scripts/prepare-db.mjs
node node_modules/prisma/build/index.js db push --skip-generate
if [ "${SEED_ON_START:-false}" = "true" ]; then
  bun scripts/seed.ts
fi
exec "$@"
