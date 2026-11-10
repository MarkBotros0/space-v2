#!/usr/bin/env bash
# PreToolUse on Edit|Write|MultiEdit: refuse writes CLAUDE.md forbids.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] || exit 0

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

case "$file" in
  */JPC/jpc-space/* | */JPC/jpc-space) deny "Blocked by .claude/hooks: JPC/jpc-space is READ-ONLY reference (CLAUDE.md). Report what looks wrong; don't edit it." ;;
esac
case "$file" in "$root"/*) ;; *) exit 0 ;; esac
rel="${file#"$root"/}"

case "$rel" in
  */src/generated/*) deny "Blocked by .claude/hooks: src/generated is Prisma output. Change schema.prisma and run db:generate." ;;
  *.env | */.env | *.env.local | *.env.production | *.env.development)
    deny "Blocked by .claude/hooks: .env files hold secrets and are the owner's to edit. Change .env.example and say which variable to set." ;;
esac

# An applied migration is history: fix forward with a new migration. A migration this branch
# added and hasn't committed may still be edited.
if [[ "$rel" =~ ^apps/backend/prisma/migrations/[^/]+/(migration|rollback)\.sql$ ]] && git -C "$root" ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
  deny "Blocked by .claude/hooks: $rel is a committed migration. Don't rewrite it; add a new migration (with its rollback.sql) that changes forward."
fi
exit 0
