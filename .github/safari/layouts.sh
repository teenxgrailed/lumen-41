#!/usr/bin/env bash
# Safari's three tab-bar layouts for the phone probe (safari-phone.yml, step
# "Safari tab layouts"). Run from the repo root with UDID and RUNNER_TEMP set.
#   layouts.sh all     the whole step: boot script, server, the three layouts,
#                      summary, verdict. Exit status is the verdict.
#   layouts.sh one L   one layout (compact|top|bottom), called by `all` under a
#                      time limit so a stalled layout cannot take the others.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export PROBE_LOG=debug/layouts.log
mkdir -p shots debug
# shellcheck source=lib.sh
. "$HERE/lib.sh"

one() {
  local L=$1 TAG=$1
  say "=== layout $L"
  if [ "$L" != compact ] && ! LAYOUT_SET_BUDGET=420 tmo 600 python3 "$HERE/layout.py" set "$L"; then
    echo "::warning::could not set the $L layout; its readings are tagged $L-unset"
    TAG="$L-unset"
  fi
  run 60 "terminate Safari" xcrun simctl terminate "$UDID" com.apple.mobilesafari || true
  sleep 2
  python3 "$HERE/layout.py" mark "$L at rest"
  open_url "http://127.0.0.1:8000/?layout=$TAG"
  sleep 6
  shot "layout-$L-00-viewport"
  python3 "$HERE/layout.py" mark "$L scrolled"
  run 180 "scroll up 3" python3 "$HERE/ui.py" up 3
  sleep 5
  shot "layout-$L-00b-viewport-scrolled"
  open_url "http://127.0.0.1:3000/today"
  shot "layout-$L-01-today-top"
  run 180 "scroll up 2" python3 "$HERE/ui.py" up 2
  sleep 2
  shot "layout-$L-02-today-scrolled"
  open_url "http://127.0.0.1:3000/tasks"
  run 400 "scroll up 12" python3 "$HERE/ui.py" up 12
  sleep 2
  shot "layout-$L-04-tasks-bottom"
  say "=== layout $L finished"
}

all() {
  local L rc SERVE_PID
  npx tsx "$HERE/boot-js.ts" > "$RUNNER_TEMP/viewport-boot.js"
  python3 "$HERE/layout.py" serve "$RUNNER_TEMP/viewport-boot.js" > debug/viewport-serve.log 2>&1 < /dev/null &
  SERVE_PID=$!
  sleep 2
  run 60 "appearance light" xcrun simctl ui "$UDID" appearance light
  for L in compact top bottom; do
    # one layout may take 15 minutes; past that it is cut and the next one runs
    tmo 900 bash "$0" one "$L"
    rc=$?
    if [ "$rc" = 142 ]; then
      echo "::warning title=Safari tab layouts::$L was cut at 900 s (its shots so far are kept)"
    fi
    say "layout $L exit $rc"
  done
  tmo 600 python3 "$HERE/layout.py" set compact || echo "::warning::could not set Compact back"
  run 60 "terminate Safari" xcrun simctl terminate "$UDID" com.apple.mobilesafari || true
  kill "$SERVE_PID" 2>/dev/null || true
  python3 "$HERE/layout.py" summary | tee shots/layouts-summary.txt
  python3 "$HERE/layout.py" verdict | tee -a shots/layouts-summary.txt
}

case "${1:-}" in
  all) all ;;
  one) one "$2" ;;
  *)
    echo "usage: layouts.sh all | one compact|top|bottom" >&2
    exit 2
    ;;
esac
