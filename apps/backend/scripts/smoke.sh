#!/usr/bin/env bash
# Smoke-test every /api/v1 endpoint against a running server.
# Usage: ./scripts/smoke.sh            (provisions a throwaway account)
#        SMOKE_EMAIL=... SMOKE_PASSWORD=... ./scripts/smoke.sh
#
# Run from apps/backend. Prints HTTP status codes only — never a token,
# password, or connection string.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${BASE:-http://localhost:4000}"

# Provision a disposable account (deleted in the trap below). Uses the same
# space-v2-test- prefix the integration fixtures use, so the existing
# prefix-scoped cleanup would also reclaim it if this script dies hard.
SMOKE_EMAIL="${SMOKE_EMAIL:-}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-}"
PROVISIONED=0
if [ -z "$SMOKE_EMAIL" ]; then
  SMOKE_EMAIL="space-v2-test-smoke-$(node -e 'process.stdout.write(require("crypto").randomUUID())')@jpc.test"
  SMOKE_PASSWORD="correct-horse-battery"
  PROVISIONED=1
  node -e "
    require('ts-node').register({transpileOnly:true});
    const {db}=require('./src/db/client');
    const bcrypt=require('bcryptjs');
    (async()=>{
      await db.user.create({data:{email:process.argv[1],name:'Smoke Test',role:'STUDENT',
        passwordHash:await bcrypt.hash(process.argv[2],10)}});
      await db.\$disconnect();
    })()
  " "$SMOKE_EMAIL" "$SMOKE_PASSWORD"
fi

cleanup() {
  [ "$PROVISIONED" = 1 ] || return 0
  node -e "
    require('ts-node').register({transpileOnly:true});
    const {db}=require('./src/db/client');
    (async()=>{
      const u=await db.user.findUnique({where:{email:process.argv[1]},select:{id:true}});
      if (u) { await db.refreshToken.deleteMany({where:{userId:u.id}});
               await db.user.delete({where:{id:u.id}}); }
      await db.\$disconnect();
    })()
  " "$SMOKE_EMAIL"
}
trap cleanup EXIT

TOKENS=$(curl -sS -X POST "$BASE/api/v1/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}")
ACCESS=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).data.accessToken)" "$TOKENS")
REFRESH=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).data.refreshToken)" "$TOKENS")

hit() { # method path
  printf '%-6s %-48s -> ' "$1" "$2"
  curl -sS -o /dev/null -w '%{http_code}\n' -X "$1" "$BASE$2" -H "authorization: Bearer $ACCESS"
}

hit GET /health
hit GET /api/v1/me
hit GET /api/v1/seasons
SEASON=$(curl -sS "$BASE/api/v1/seasons" -H "authorization: Bearer $ACCESS" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(String(JSON.parse(d).data.seasons[0]?.id ?? '')))")
if [ -n "$SEASON" ]; then
  hit GET "/api/v1/seasons/$SEASON"
  hit GET "/api/v1/seasons/$SEASON/groups"
  hit GET "/api/v1/seasons/$SEASON/sessions"
  hit GET "/api/v1/seasons/$SEASON/assignments"
else
  echo "no seasons visible to this account — season-scoped paths not exercised"
fi

# Negative checks: the envelope must hold on the error paths too.
printf '%-6s %-48s -> ' GET '/api/v1/seasons/abc (expect 400)'
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/seasons/abc" -H "authorization: Bearer $ACCESS"
printf '%-6s %-48s -> ' GET '/api/v1/me (no token, expect 401)'
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/me"
printf '%-6s %-48s -> ' GET '/api/v1/nope (expect 404)'
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/nope" -H "authorization: Bearer $ACCESS"

curl -sS -o /dev/null -X POST "$BASE/api/v1/auth/logout" \
  -H 'content-type: application/json' -d "{\"refreshToken\":\"$REFRESH\"}"
echo "logged out"
