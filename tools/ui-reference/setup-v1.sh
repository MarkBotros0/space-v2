#!/usr/bin/env bash
# Copy v1 into ~/projects/JPC/.v1-reference/app and configure it against the
# Neon branch. Never writes to jpc-space; never prints a secret.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HOME/projects/JPC/jpc-space"
REF="$HOME/projects/JPC/.v1-reference"
APP="$REF/app"
BRANCH_FILE="$HOME/.secrets/jpc-v1-reference-db-url"

[ -s "$BRANCH_FILE" ] || { echo "Missing $BRANCH_FILE (Neon branch URL)."; exit 1; }

node --input-type=module -e "
  import { readFileSync } from 'node:fs';
  import { assertBranchNotProduction } from '$HERE/lib/guard.mjs';
  const branch = readFileSync('$BRANCH_FILE', 'utf8').trim();
  const env = readFileSync('$SRC/.env', 'utf8');
  const m = env.match(/^DATABASE_URL\s*=\s*\"?([^\"\n]+)\"?/m);
  assertBranchNotProduction(branch, m ? m[1] : '');
  console.log('guard: branch is not production');
"

mkdir -p "$APP"
umask 077
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude .next \
  --exclude '.env*' --exclude .vercel --exclude uploads \
  "$SRC/" "$APP/"

{
  printf 'DATABASE_URL="%s"\n' "$(cat "$BRANCH_FILE")"
  printf 'AUTH_SECRET="%s"\n' "$(openssl rand -base64 32)"
  printf 'AUTH_URL="http://localhost:3100"\n'
  printf 'AUTH_TRUST_HOST="true"\n'
  printf 'DEV_USER_SWITCHER="1"\n'
  printf 'STORAGE_DRIVER="local"\n'
  printf 'LOCAL_UPLOADS_DIR="./uploads"\n'
} > "$APP/.env.local"
chmod 600 "$APP/.env.local"

cd "$APP"
npm ci
echo "setup complete: $APP"
