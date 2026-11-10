#!/usr/bin/env bash
# Prove a migration's rollback: apply -> rollback.sql -> re-apply on the throwaway DB, comparing
# schema dumps at each step. Refuses unless the worktree's .env targets the throwaway DB.
# Usage: bash cycle-migration.sh <worktree> <migration_dir_name>   (the migration not yet applied)
set -euo pipefail

WT=$(cd "${1:?usage: cycle-migration.sh <worktree> <migration>}" && pwd)
NAME=${2:?usage: cycle-migration.sh <worktree> <migration>}
B="$WT/apps/backend"
C=space-v2-refactor-db
OUT="${TMPDIR:-/tmp}/space-v2-cycle/$NAME"
mkdir -p "$OUT"
cd "$B"

TARGET=$(node -e 'require("dotenv").config();const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.hostname+":"+u.port+u.pathname)')
[ "$TARGET" = "127.0.0.1:55441/refactor_test" ] || { echo "REFUSING: .env targets $TARGET, not the throwaway DB (run throwaway-db.sh)"; exit 1; }
RB="prisma/migrations/$NAME/rollback.sql"
[ -f "prisma/migrations/$NAME/migration.sql" ] || { echo "missing prisma/migrations/$NAME/migration.sql"; exit 1; }
[ -f "$RB" ] || { echo "missing $RB: every migration ships one"; exit 1; }
grep -q "DELETE FROM \"_prisma_migrations\" WHERE migration_name = '$NAME'" "$RB" ||
  { echo "$RB must end by deleting its own _prisma_migrations row (the repo convention)"; exit 1; }

dump() { docker exec "$C" pg_dump -U postgres -d refactor_test --schema-only --no-owner -T _prisma_migrations |
  grep -v -e '^-- Dumped' -e '^.restrict' -e '^.unrestrict' >"$1"; }
# A column dropped and re-added comes back at the table's end: compare order-insensitively.
norm() { sed -e 's/,$//' "$1" | sort; }
deploy() { npx prisma migrate deploy 2>&1 | grep -E 'Applying|applied|Error|ERROR|P30' || true; }

dump "$OUT/0-before.sql"
echo "== apply"; deploy
dump "$OUT/1-applied.sql"
echo "== rollback"
docker exec -i "$C" psql -v ON_ERROR_STOP=1 -U postgres -d refactor_test -q <"$RB"
dump "$OUT/2-rolled.sql"
if diff -q <(norm "$OUT/0-before.sql") <(norm "$OUT/2-rolled.sql") >/dev/null; then
  echo "rollback restores the schema: OK"
else
  echo "ROLLBACK DIFF (before vs rolled back):"; diff <(norm "$OUT/0-before.sql") <(norm "$OUT/2-rolled.sql") | head -40; exit 1
fi
echo "== re-apply"; deploy
dump "$OUT/3-reapplied.sql"
if diff -q "$OUT/1-applied.sql" "$OUT/3-reapplied.sql" >/dev/null; then
  echo "re-apply identical: OK"
else
  echo "REAPPLY DIFF:"; diff "$OUT/1-applied.sql" "$OUT/3-reapplied.sql" | head -40; exit 1
fi
echo "== schema change:"; diff "$OUT/0-before.sql" "$OUT/1-applied.sql" | grep '^[<>]' | head -60 || true
