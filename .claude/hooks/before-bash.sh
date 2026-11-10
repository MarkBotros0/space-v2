#!/usr/bin/env bash
# PreToolUse on Bash: refuse the commands CLAUDE.md forbids, whoever is driving the session.
set -uo pipefail

cmd=$(jq -r '.tool_input.command // empty')
[ -n "$cmd" ] || exit 0

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

# Migrations: `migrate dev` drops the SQL-only indexes and CHECKs; reset and db push rewrite the database.
echo "$cmd" | grep -qE 'prisma[^|;&]*migrate[[:space:]]+(dev|reset)' &&
  deny "Blocked by .claude/hooks: never run \`prisma migrate dev\` or \`migrate reset\` here (CLAUDE.md: it drops SQL-only objects). Write the migration and its rollback.sql by hand; apply with db:migrate:deploy on a throwaway database."
echo "$cmd" | grep -qE 'prisma[^|;&]*db[[:space:]]+push' &&
  deny "Blocked by .claude/hooks: \`prisma db push\` bypasses migrations. Add a migration with a rollback.sql instead."

# Secrets: never print a database URL, auth secret or .env file.
echo "$cmd" | grep -qE '(cat|less|more|head|tail|bat|type)[[:space:]][^|;&]*\.env([[:space:]]|$|\.local|\.production|\.development)' &&
  deny "Blocked by .claude/hooks: don't print a .env file. Read variable names only (e.g. \`grep -o '^[A-Z_]*=' .env\`)."
echo "$cmd" | grep -qE '(echo|printf|printenv)[^|;&]*\$?\{?(DATABASE_URL|STG_DATABASE_URL|PROD_DATABASE_URL|AUTH_SECRET|CRON_SECRET|SENTRY_DSN|GMAIL_APP_PASSWORD)' &&
  deny "Blocked by .claude/hooks: don't print secrets. Print the host or the variable name only."

# The v1 repo is read-only reference.
echo "$cmd" | grep -qE 'jpc-space([/[:space:]"]|$)' && echo "$cmd" | grep -qE '(git[[:space:]]+(-C[[:space:]]+[^[:space:]]*jpc-space[^[:space:]]*[[:space:]]+)?(commit|push|reset|checkout|rebase|merge|add|rm|mv|stash|clean)|sed[[:space:]]+-i|[^>]>[^>&]|rm[[:space:]]|mv[[:space:]])' &&
  deny "Blocked by .claude/hooks: JPC/jpc-space is READ-ONLY reference (CLAUDE.md). Read it; never write to it or run git there."

# Pushing and deploying stay with the owner.
echo "$cmd" | grep -qE 'git[[:space:]]+push[^|;&]*(--force|[[:space:]]-f([[:space:]]|$)|--force-with-lease)' &&
  deny "Blocked by .claude/hooks: no force-push. Ask the owner."
echo "$cmd" | grep -qE '(^|[[:space:];&|])vercel[[:space:]]+(deploy|--prod)' &&
  deny "Blocked by .claude/hooks: never \`vercel deploy\` from a working tree (it uploads untracked files such as .env). A push to main on jpc deploys; ask the owner."

exit 0
