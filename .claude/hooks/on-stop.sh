#!/usr/bin/env bash
# Stop: before Claude hands back, run the repo-wide checks that a per-file lint can't see, on the
# packages this session changed: 400-line rule, Claude-guide paths, dead exports, and the typecheck
# of each touched app (shared touches both). Failures go back to Claude (exit 2) to fix.
# Skipped when nothing changed since the last passing run, and on the retry after a block.
set -uo pipefail

input=$(cat)
[ "$(echo "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
cd "$root" || exit 0

changed=$(git status --porcelain --untracked-files=all -- apps packages scripts docs CLAUDE.md '*/CLAUDE.md' 2>/dev/null |
  awk '{print $NF}' | grep -vE '(^|/)(node_modules|dist|src/generated)/')
[ -n "$changed" ] || exit 0

stamp_dir="${TMPDIR:-/tmp}/claude-space-v2-stop"
mkdir -p "$stamp_dir"
stamp="$stamp_dir/$(echo "$root" | md5sum | cut -c1-12)"
digest=$( (git diff HEAD -- apps packages scripts docs; echo "$changed" | xargs -r cat 2>/dev/null) | md5sum | cut -c1-32)
[ -f "$stamp" ] && [ "$(cat "$stamp")" = "$digest" ] && exit 0

fail=""
run() {
  local name="$1"
  shift
  local out
  out=$("$@" 2>&1) || fail+=$'\n'"── $name"$'\n'"$(echo "$out" | grep -vE '^\s*$' | tail -25)"
}

run "check:size (400 lines per file)" node scripts/check-size.mjs
run "check:docs (paths in CLAUDE.md and docs/rules)" node scripts/check-docs.mjs
if echo "$changed" | grep -qE '\.(ts|tsx|mjs|js)$'; then
  run "check:dead (exports nothing else names)" node scripts/check-dead.mjs
fi
touched() { echo "$changed" | grep -qE "^($1)/.*\.(ts|tsx)$"; }
if touched "apps/backend|packages/shared"; then
  run "typecheck backend" bash -c "cd apps/backend && node_modules/.bin/tsc --noEmit -p tsconfig.json"
fi
if touched "apps/mobile|packages/shared"; then
  run "typecheck mobile" bash -c "cd apps/mobile && node_modules/.bin/tsc --noEmit -p tsconfig.json"
fi
if touched "apps/mobile"; then
  run "sweep rules (apps/mobile/src/__tests__/sweep-rules.test.ts)" bash -c "cd apps/mobile && node_modules/.bin/jest --silent src/__tests__/sweep-rules.test.ts src/__tests__/design-consistency.test.ts"
fi
if touched "packages/shared"; then
  run "typecheck shared" bash -c "cd packages/shared && node_modules/.bin/tsc --noEmit -p tsconfig.json"
fi

if [ -n "$fail" ]; then
  echo "Repo checks failed on this session's changes (CLAUDE.md \"Code & Data Standards\"). Fix them, or say why not, before finishing:$fail" >&2
  exit 2
fi
echo "$digest" >"$stamp"
exit 0
