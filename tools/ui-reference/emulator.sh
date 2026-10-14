#!/usr/bin/env bash
# Boots the JPC-only emulator on port 5558. Never touches nanny-e2e/egx-ui.
# Pass --wipe on the first boot (the AVD was cloned from nanny-e2e).
set -euo pipefail
WIPE=""; [ "${1:-}" = "--wipe" ] && WIPE="-wipe-data"
tmux kill-session -t jpc-space-emulator 2>/dev/null || true
mkdir -p ~/logs
tmux new -d -s jpc-space-emulator "~/Android/Sdk/emulator/emulator -avd jpc-ui -port 5558 -no-window -gpu swiftshader_indirect -no-snapshot-load -no-snapshot-save -no-audio -no-boot-anim $WIPE 2>&1 | tee ~/logs/jpc-space-emulator.log"
ADB=~/Android/Sdk/platform-tools/adb
for i in $(seq 1 160); do
  [ "$($ADB -s emulator-5558 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
  sleep 3
done
$ADB -s emulator-5558 shell svc wifi disable   # nanny-app lab: host routing breaks with emulated Wi-Fi on
$ADB -s emulator-5558 shell wm size 1125x2436   # emulator rounds hw.lcd.width to even (1126); force 375dp
$ADB -s emulator-5558 shell wm size
$ADB -s emulator-5558 shell wm density
