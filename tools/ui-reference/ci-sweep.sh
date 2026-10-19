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
# The Pixel Launcher on the API 34 image freezes under the software GPU and
# its "isn't responding" dialog then covers the app, so no flow can find
# "Sign in". The sweep starts the app with `am start` and never needs a home
# screen, so the launcher is switched off for the run.
adb shell pm disable-user --user 0 com.google.android.apps.nexuslauncher || true
sleep 5

# Taps "Wait" on any "isn't responding" dialog still on screen.
dismiss_anr() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 || return 0
  local b
  b=$(adb shell cat /sdcard/ui.xml | grep -oE 'text="Wait"[^>]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | grep -oE '[0-9]+' | tail -n 4 | tr '\n' ' ')
  [ -z "$b" ] && return 0
  set -- $b
  echo "[ci-sweep] dismissing a not-responding dialog"
  adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
  sleep 2
}
dismiss_anr
adb logcat -c

# By command line, not pid: the backgrounded subshell's pid is a bash whose
# node child survived the kill, kept answering /health, and held the step's
# output open after this script ended, so the job never finished.
stop_backend() {
  pkill -f "src/server.ts" 2>/dev/null || true
  for _ in $(seq 1 10); do
    curl -fs http://localhost:4100/health > /dev/null || break
    sleep 1
  done
}
# A backend still running when this script ends keeps the emulator step
# waiting forever (the last run sat there until the job was cancelled).
# Maestro can leave its JVM behind too (seen after `maestro hierarchy`).
cleanup() {
  stop_backend
  pkill -f "maestro" 2>/dev/null || true
}
trap cleanup EXIT

start_backend() {
  stop_backend
  (cd apps/backend && PORT=4100 exec setsid node -r ts-node/register/transpile-only src/server.ts < /dev/null >> ../../backend.log 2>&1 &)
  for _ in $(seq 1 30); do
    curl -fs http://localhost:4100/health > /dev/null && return 0
    sleep 2
  done
  echo "[ci-sweep] backend did not come up"; tail -n 50 backend.log; return 1
}

start_backend || exit 1
# Logged only: whether the emulator reaches the backend at all.
adb shell 'printf "GET /health HTTP/1.0\r\n\r\n" | nc -w 5 10.0.2.2 4100' || echo "[ci-sweep] emulator cannot reach 10.0.2.2:4100"

# One sign-in as the fake student, then what is on screen, the app's errors
# and the backend's requests, while the result is still there to read.
echo "[ci-sweep] sign-in check:"
EMAIL=$(node -p 'JSON.parse(require("fs").readFileSync(process.env.UI_SWEEP_USERS_FILE, "utf8")).student.email')
CHECK_DIR=$(mktemp -d)
timeout 300 maestro --device "$UI_SWEEP_DEVICE" test --test-output-dir="$CHECK_DIR" -e EMAIL="$EMAIL" -e PASSWORD="$UI_SWEEP_PASSWORD" apps/mobile/.maestro/ci/signin-check.yaml 2>&1 | tail -n 20
# The two check screenshots, shrunk and printed as base64, so they can be
# read from the job log alone (fake data only).
command -v convert > /dev/null && for shot in $(find "$CHECK_DIR" -name 'ci-*.png' | sort); do
  echo "[ci-sweep] screenshot $(basename "$shot") base64:"
  convert "$shot" -resize 360x -quality 60 jpg:- | base64 -w 0; echo
done
timeout 120 maestro --device "$UI_SWEEP_DEVICE" hierarchy 2>/dev/null | grep -oE '"(text|accessibilityText|hintText)" *: *"[^"]+"' | sort -u | head -n 60
adb logcat -d | grep -E " E |ReactNativeJS|AndroidRuntime|FATAL" | grep -v "E Netd\|E cutils\|E bpf" | tail -n 60
grep -v "GET /health" backend.log | tail -n 20
adb logcat -c

cells=$(node --input-type=module -e '
  import { CELLS, pick } from "./tools/ui-reference/lib/sweep.mjs";
  const wanted = process.env.SWEEP_CELLS ? process.env.SWEEP_CELLS.split(",") : null;
  console.log(pick(CELLS, wanted, (c) => c.id, "cell").map((c) => c.id).join(" "));
') || exit 1

mkdir -p "$UI_SWEEP_OUTPUT/run"
for cell in $cells; do
  start_backend || exit 1
  dismiss_anr
  # A hung Maestro would otherwise hold the job until its timeout with no log.
  if ! timeout 1500 node tools/ui-reference/ui-sweep.mjs --into=run --cells="$cell" ${SWEEP_FLOWS:+--flows="$SWEEP_FLOWS"}; then
    echo "[ci-sweep] $cell stopped early; restoring the device"
    node tools/ui-reference/ui-sweep.mjs --restore
  fi
  # The text on screen where the cell's last flow ended (a login error, say),
  # since the screenshots are only in the artifact.
  echo "[ci-sweep] on screen after $cell:"
  timeout 120 maestro --device "$UI_SWEEP_DEVICE" hierarchy 2>/dev/null | grep -oE '"(text|accessibilityText|hintText)" *: *"[^"]+"' | sort -u | head -n 40 || true
done

# What the app itself logged: JS errors, network failures, cleartext refusals.
echo "[ci-sweep] app log:"
adb logcat -d | grep -iE "ReactNativeJS|cleartext|Network Error|okhttp|AxiosError" | tail -n 120 || true

# Anything still running here keeps the emulator step from returning.
echo "[ci-sweep] processes left:"
ps -eo pid,ppid,etime,args --forest | grep -vE "\[|ps -eo|grep" | tail -n 40
