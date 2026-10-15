#!/usr/bin/env bash
# capture-v2.sh <role> <light|dark> <route> <name> [shots] [wait-for-text] [tap-first]
# Signs in as the reference user for <role> (password from ~/.secrets, never printed),
# sets the emulator's night mode, opens <route> and saves numbered screenshots under
# ~/projects/JPC/.v2-captures/${BATCH:-batch-2}/<role>/<theme>/. Role "public" signs out first.
set -euo pipefail
role=$1 theme=$2 route=$3 name=$4 shots=${5:-4} wait=${6:-.+} tap=${7:-}
here=$(cd "$(dirname "$0")" && pwd)
mobile="$here/../../apps/mobile"
adb=~/Android/Sdk/platform-tools/adb
maestro=~/.maestro/bin/maestro
root=~/projects/JPC/.v2-captures/${BATCH:-batch-2}
out=$root/$role/$theme
mkdir -p "$out"
if [ "$theme" = dark ]; then night=yes; else night=no; fi
$adb -s emulator-5558 shell cmd uimode night "$night" >/dev/null
stamp=$root/.signed-in
if [ "$role" = public ]; then
  if [ "$(cat "$stamp" 2>/dev/null)" != public ]; then
    $adb -s emulator-5558 shell pm clear com.jpc.space >/dev/null
    echo public > "$stamp"
  fi
elif [ "$(cat "$stamp" 2>/dev/null)" != "$role" ]; then
  email=$(node -e "console.log(require(process.env.HOME+'/projects/JPC/.v1-reference/users.json')['$role'].email)")
  password=$(cat ~/.secrets/jpc-v1-reference-password)
  $maestro --device emulator-5558 test -e EMAIL="$email" -e PASSWORD="$password" "$mobile/.maestro/login-as.yaml" >/dev/null
  echo "$role" > "$stamp"
fi
tmp=$(mktemp -d)
if [ -n "$tap" ]; then flow=capture-screen-tap.yaml; else flow=capture-screen.yaml; fi
$maestro --device emulator-5558 test --test-output-dir "$tmp" -e ROUTE="$route" -e NAME="$name" -e SHOTS="$shots" -e WAIT="$wait" -e TAP="$tap" "$mobile/.maestro/$flow" >/dev/null
rm -f "$out/$name"-[0-9]*.png
find "$tmp" -name "$name-*.png" -exec cp {} "$out/" \;
rm -rf "$tmp"
ls "$out" | grep "^$name-"
