#!/usr/bin/env bash
set -euo pipefail
APP="$HOME/projects/JPC/.v1-reference/app"
tmux kill-session -t jpc-space-v1-ref 2>/dev/null || true
mkdir -p "$HOME/logs"
tmux new -d -s jpc-space-v1-ref "cd '$APP' && npx next build && npx next start -H 127.0.0.1 -p 3100 2>&1 | tee $HOME/logs/jpc-space-v1-ref.log"
for i in $(seq 1 300); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/login || true)
  [ "$code" = "200" ] && { echo "v1 up on :3100"; exit 0; }
  sleep 2
done
echo "v1 did not answer /login with 200 within 600s; see ~/logs/jpc-space-v1-ref.log"; exit 1
