#!/usr/bin/env bash
# Apply prisma/migrations/*/migration.sql, in order, to a LOCAL scratch database.
#
# Why not `prisma migrate deploy`: Prisma 7 needs a prisma.config.ts carrying
# the datasource URL, and this repo deliberately has none (the app supplies the
# URL through a driver adapter). Plain psql over the same SQL files produces the
# same schema without adding config. Used by the e2e CI job and local runs.
#
# Refuses non-local hosts — v1's staging database already has these applied
# and is not ours to touch.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?DATABASE_URL is required}"
case "$DATABASE_URL" in
  *@localhost[:/]*|*@127.0.0.1[:/]*) ;;
  *) echo "refusing to migrate a non-local database" >&2; exit 1 ;;
esac
for f in prisma/migrations/*/migration.sql; do
  echo "applying $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
