#!/usr/bin/env bash
# v2 backend on :4100 against the shared test database (URL read from
# jpc-space/.env, never printed). The emulator reaches it at 10.0.2.2:4100.
set -euo pipefail
cd ~/projects/JPC/space-v2/apps/backend
tmux kill-session -t jpc-space-backend-ref 2>/dev/null || true
mkdir -p ~/logs
tmux new -d -s jpc-space-backend-ref "DATABASE_URL=\"\$(node -e \"import('$HOME/projects/JPC/space-v2/tools/ui-reference/lib/db-url.mjs').then(m=>process.stdout.write(m.readDatabaseUrl()))\")\" AUTH_SECRET=\"\$(openssl rand -base64 32)\" PORT=4100 MOBILE_APP_ORIGIN='*' pnpm dev 2>&1 | tee ~/logs/jpc-space-backend-ref.log"
for i in $(seq 1 60); do
  curl -s -m 3 http://localhost:4100/health | grep -q '"up"' && { echo "backend up on :4100"; exit 0; }
  sleep 2
done
echo "backend did not report database up; see ~/logs/jpc-space-backend-ref.log"; exit 1
