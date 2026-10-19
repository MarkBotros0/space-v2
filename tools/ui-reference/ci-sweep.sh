#!/usr/bin/env bash
# The UI sweep as .github/workflows/ui-sweep.yml runs it, inside
# reactivecircus/android-emulator-runner. Not for the devbox: there,
# run ui-sweep.mjs directly (README.md "UI sweep").
#
# One ui-sweep.mjs run per cell, all into the same contact sheet, with the
# job's backend restarted before each cell. The login limiter allows 20
# sign-ins per 15 minutes and every signed-in flow signs in afresh, so one
# run across all 16 cells would hit 429s within a few cells; a restart
# empties the limiter's in-memory store.
#
# Env: SWEEP_CELLS / SWEEP_FLOWS (comma-separated prefixes, blank = all),
# UI_SWEEP_OUTPUT, plus what ui-sweep.mjs and the backend read.
set -uo pipefail
cd "$(dirname "$0")/../.."

adb install -r app.apk || exit 1
# Wi-Fi off, as emulator.sh does: with emulated Wi-Fi on, the emulator's
# route to the host (10.0.2.2) breaks.
adb shell svc wifi disable
sleep 5
adb logcat -c

start_backend() {
  [ -f backend.pid ] && kill "$(cat backend.pid)" 2>/dev/null && sleep 2
  (cd apps/backend && PORT=4100 nohup node -r ts-node/register/transpile-only src/server.ts >> ../../backend.log 2>&1 & echo $! > ../../backend.pid)
  for _ in $(seq 1 30); do
    curl -fs http://localhost:4100/health > /dev/null && return 0
    sleep 2
  done
  echo "[ci-sweep] backend did not come up"; tail -n 50 backend.log; return 1
}

start_backend || exit 1
# Logged only: whether the emulator reaches the backend at all.
adb shell 'printf "GET /health HTTP/1.0\r\n\r\n" | nc -w 5 10.0.2.2 4100' || echo "[ci-sweep] emulator cannot reach 10.0.2.2:4100"

cells=$(node --input-type=module -e '
  import { CELLS, pick } from "./tools/ui-reference/lib/sweep.mjs";
  const wanted = process.env.SWEEP_CELLS ? process.env.SWEEP_CELLS.split(",") : null;
  console.log(pick(CELLS, wanted, (c) => c.id, "cell").map((c) => c.id).join(" "));
') || exit 1

mkdir -p "$UI_SWEEP_OUTPUT/run"
for cell in $cells; do
  start_backend || exit 1
  node tools/ui-reference/ui-sweep.mjs --into=run --cells="$cell" ${SWEEP_FLOWS:+--flows="$SWEEP_FLOWS"}
done

# What the app itself logged: JS errors, network failures, cleartext refusals.
echo "[ci-sweep] app log:"
adb logcat -d | grep -iE "ReactNativeJS|cleartext|Network Error|okhttp|AxiosError" | tail -n 120 || true
