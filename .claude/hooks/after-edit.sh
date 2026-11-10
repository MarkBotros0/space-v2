#!/usr/bin/env bash
# PostToolUse on Edit|Write|MultiEdit: hold every file Claude writes to the repo's standards.
# - Prettier fixes the formatting in place (the same config `pnpm lint` checks).
# - ESLint runs on the file with its package's config (size, depth, layer and boundary rules).
#   Errors go back to Claude (exit 2) so it fixes them before moving on; warnings are ignored.
# - A schema.prisma edit gets the migration checklist as a reminder.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
file=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0
case "$file" in "$root"/*) ;; *) exit 0 ;; esac
case "$file" in */node_modules/* | */src/generated/* | */dist/* | */.claude/worktrees/*) exit 0 ;; esac
rel="${file#"$root"/}"

if [ "$rel" = "apps/backend/prisma/schema.prisma" ]; then
  jq -n '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext:
    "schema.prisma changed. Per CLAUDE.md: add a migration in its own folder with a rollback.sql (one concern; BEGIN/COMMIT unless CONCURRENTLY, one CONCURRENTLY statement per file), note any SQL-only CHECK or partial index on the model as `// SQL-only`, index every new foreign key (schema-conformance.test.ts), run `pnpm --filter @space/backend db:erd`, update the schema snapshot. Never run `prisma migrate dev` against a migrated database."}}'
  exit 0
fi

case "$file" in
  *.ts | *.tsx | *.js | *.mjs | *.cjs | *.json) ;;
  *) exit 0 ;;
esac

"$root/node_modules/.bin/prettier" --write --log-level warn "$file" >/dev/null 2>&1

case "$file" in *.json) exit 0 ;; esac

# The package whose eslint.config.js applies: apps/<x>, packages/<x>, else the repo root.
pkg="$root"
case "$rel" in apps/*/* | packages/*/*) pkg="$root/$(echo "$rel" | cut -d/ -f1-2)" ;; esac
eslint="$pkg/node_modules/.bin/eslint"
[ -x "$eslint" ] || eslint="$root/node_modules/.bin/eslint"
[ -f "$pkg/eslint.config.js" ] || exit 0

out=$(cd "$pkg" && "$eslint" --quiet --no-warn-ignored "$file" 2>&1)
if [ $? -ne 0 ] && [ -n "$out" ]; then
  {
    echo "ESLint errors in $rel (repo standards, see CLAUDE.md \"Code & Data Standards\"). Fix them before continuing:"
    echo "$out" | grep -vE '^\s*$' | head -40
  } >&2
  exit 2
fi
exit 0
