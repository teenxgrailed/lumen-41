#!/usr/bin/env bash
# Safari's three tab-bar layouts for the phone probe (safari-phone.yml, the
# "Safari layouts ..." steps). Run from the repo root with UDID and RUNNER_TEMP
# set. One phase per workflow step, so that a phase that stalls costs only its
# own step timeout and the shots + debug/layouts.log of every earlier phase
# are already uploaded.
#   layouts.sh prepare    the app's boot script and the viewport page server
#   layouts.sh set L      Settings > Safari > Tabs > L (compact needs nothing)
#   layouts.sh shots L [viewport|today|tasks]
#                         the viewport page, the app at rest and scrolled (one part per step)
#   layouts.sh finish     Compact back, stop the server, summary, verdict
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export PROBE_LOG=debug/layouts.log
mkdir -p shots debug
# shellcheck source=lib.sh
. "$HERE/lib.sh"

prepare() {
  say "prepare: boot script"
  tmo 300 npx tsx "$HERE/boot-js.ts" > "$RUNNER_TEMP/viewport-boot.js"
  say "prepare: boot script $(wc -c < "$RUNNER_TEMP/viewport-boot.js") bytes, starting the viewport server"
  # survives the step, like the app server: own session, no inherited pipes
  nohup python3 "$HERE/layout.py" serve "$RUNNER_TEMP/viewport-boot.js" > debug/viewport-serve.log 2>&1 < /dev/null &
  disown
  sleep 2
  # what the machine is doing, every 20 s: a stalled run that leaves nothing
  # else still shows whether something was spinning (load, top processes)
  nohup bash -c 'while :; do date +%T; uptime; ps -Ao pcpu,rss,comm -r | head -7; top -l 1 -n 0 | sed -n 1,12p; vm_stat | head -6; sleep 20; done' > debug/load.log 2>&1 < /dev/null &
  disown
  run 60 "appearance light" xcrun simctl ui "$UDID" appearance light
  curl -fsS -m 10 -o /dev/null http://127.0.0.1:8000/ && say "viewport server up"
}

set_layout() {
  local L=$1 TAG=$1
  say "=== set layout $L"
  if [ "$L" != compact ] && ! LAYOUT_SET_BUDGET=420 tmo 600 python3 "$HERE/layout.py" set "$L"; then
    echo "::warning::could not set the $L layout; its readings are tagged $L-unset"
    TAG="$L-unset"
  fi
  echo "$TAG" > "debug/layout-tag-$L"
  say "=== layout $L set, readings tagged $TAG"
}

shots() {
  local L=$1 PART=${2:-all} TAG
  TAG=$(cat "debug/layout-tag-$L" 2>/dev/null || { [ "$L" = compact ] && echo compact || echo "$L-unset"; })
  say "=== shots layout $L $PART (tag $TAG)"
  case "$PART" in
    all | viewport)
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
      ;;
  esac
  case "$PART" in
    all | today)
      open_url "http://127.0.0.1:3000/today"
      shot "layout-$L-01-today-top"
      run 180 "scroll up 2" python3 "$HERE/ui.py" up 2
      sleep 2
      shot "layout-$L-02-today-scrolled"
      ;;
  esac
  case "$PART" in
    all | tasks)
      open_url "http://127.0.0.1:3000/tasks"
      run 400 "scroll up 12" python3 "$HERE/ui.py" up 12
      sleep 2
      shot "layout-$L-04-tasks-bottom"
      ;;
  esac
  say "=== shots layout $L $PART done"
}

finish() {
  tmo 600 python3 "$HERE/layout.py" set compact || echo "::warning::could not set Compact back"
  run 60 "terminate Safari" xcrun simctl terminate "$UDID" com.apple.mobilesafari || true
  pkill -f "layout.py serve" || true
  pkill -f "uptime; ps -Ao" || true
  python3 "$HERE/layout.py" summary | tee shots/layouts-summary.txt
  python3 "$HERE/layout.py" verdict | tee -a shots/layouts-summary.txt
}

case "${1:-}" in
  prepare) prepare ;;
  set) set_layout "$2" ;;
  shots) shots "$2" "${3:-all}" ;;
  finish) finish ;;
  *)
    echo "usage: layouts.sh prepare | set L | shots L | finish" >&2
    exit 2
    ;;
esac
