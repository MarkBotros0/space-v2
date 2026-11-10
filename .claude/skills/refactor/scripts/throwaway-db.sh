#!/usr/bin/env bash
# Point a refactor worktree at the throwaway Postgres, never a real database.
# Usage: bash throwaway-db.sh <worktree>
#   Ensures docker container space-v2-refactor-db (postgres:17, 127.0.0.1:55441) and database
#   refactor_test, writes <worktree>/apps/backend/.env (mode 600: DATABASE_URL to it + a random
#   AUTH_SECRET), and applies every migration. Prints hosts only, never a URL or secret.
set -euo pipefail

WT=$(cd "${1:?usage: throwaway-db.sh <worktree>}" && pwd)
B="$WT/apps/backend"
[ -f "$B/prisma/schema.prisma" ] || { echo "not a space-v2 worktree: $WT"; exit 1; }
[ "$WT" != "/home/mark/projects/JPC/space-v2" ] || { echo "refusing: use a worktree, not the main checkout (its .env is the owner's)"; exit 1; }

C=space-v2-refactor-db
PORT=55441
if ! docker ps --format '{{.Names}}' | grep -qx "$C"; then
  if docker ps -a --format '{{.Names}}' | grep -qx "$C"; then
    docker start "$C" >/dev/null
  else
    pw=$(openssl rand -hex 16)
    docker run -d --name "$C" -e POSTGRES_PASSWORD="$pw" -p 127.0.0.1:$PORT:5432 postgres:17 >/dev/null
    echo "$pw" >"$HOME/.space-v2-refactor-db.pw" && chmod 600 "$HOME/.space-v2-refactor-db.pw"
  fi
  for _ in $(seq 1 30); do docker exec "$C" pg_isready -U postgres -q && break; sleep 1; done
fi
pw=$(docker exec "$C" printenv POSTGRES_PASSWORD)
docker exec "$C" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='refactor_test'" | grep -q 1 ||
  docker exec "$C" psql -U postgres -qc "CREATE DATABASE refactor_test"

umask 077
{
  echo "DATABASE_URL=postgresql://postgres:$pw@127.0.0.1:$PORT/refactor_test"
  echo "AUTH_SECRET=$(openssl rand -hex 32)"
  echo "RATE_LIMIT_STORE=memory"
} >"$B/.env"
chmod 600 "$B/.env"

cd "$B" && npx prisma migrate deploy 2>&1 | grep -E 'migrations? (found|applied)|No pending|Error|P30' || true
echo "throwaway DB ready: $C on 127.0.0.1:$PORT, database refactor_test; $B/.env points at it."
