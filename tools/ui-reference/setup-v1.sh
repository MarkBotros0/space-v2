#!/usr/bin/env bash
# Copy v1 into ~/projects/JPC/.v1-reference/app and run it against the shared
# test database from jpc-space/.env (owner ruling 2026-10-14). Never writes to
# jpc-space; never prints a secret. Gmail credentials are not copied, so the
# copy sends no email.
set -euo pipefail
SRC="$HOME/projects/JPC/jpc-space"
REF="$HOME/projects/JPC/.v1-reference"
APP="$REF/app"

mkdir -p "$APP"
umask 077
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude .next \
  --exclude '.env*' --exclude .vercel --exclude uploads \
  "$SRC/" "$APP/"

DB_LINE="$(grep -E '^DATABASE_URL=' "$SRC/.env")"
{
  printf '%s\n' "$DB_LINE"
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
