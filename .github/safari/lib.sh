# shellcheck shell=bash
# Shared by the probe's shell steps (source it). Every call that can block on a
# simulator that stopped answering goes through `tmo`, so one stuck simctl/idb
# call costs its limit, not the step; every action is logged with a timestamp.
# Workflow steps run `bash -e`: a timed-out call (rc 142) must not end the step.
set +e
T0=$SECONDS
PROBE_LOG="${PROBE_LOG:-debug/probe.log}"
mkdir -p "$(dirname "$PROBE_LOG")"

# tmo SECONDS cmd...: SIGALRM kills the command (exec replaces perl); rc 142
tmo() { perl -e 'alarm shift; exec @ARGV' "$@"; }

# say TEXT...: "[hh:mm:ss +123s] text" to the step log and to $PROBE_LOG, flushed
say() {
  printf '[%s +%ss] %s\n' "$(date +%H:%M:%S)" "$((SECONDS - T0))" "$*" | tee -a "$PROBE_LOG"
}

# run LIMIT NAME cmd...: tmo + log start, end, exit code; a timeout is named
run() {
  local limit=$1 name=$2 rc
  shift 2
  say "run  $name (limit ${limit}s)"
  tmo "$limit" "$@"
  rc=$?
  if [ "$rc" = 142 ]; then
    say "TIMEOUT $name after ${limit}s"
    echo "::warning title=Probe call timed out::$name after ${limit}s"
  else
    say "done $name rc=$rc"
  fi
  return "$rc"
}

# shot NAME: a screenshot into shots/NAME.png (30 s)
shot() { run 30 "screenshot $1" xcrun simctl io "$UDID" screenshot "shots/$1.png"; }

# open_url URL: openurl (3 tries, 60 s each), then wait until Safari has painted
# a real page (a blank or error page is a tiny JPEG; at most 30 probes)
open_url() {
  local t i size
  for t in 1 2 3; do
    run 60 "openurl $1 (try $t)" xcrun simctl openurl "$UDID" "$1" && break
    sleep 10
  done
  sleep 4
  for i in $(seq 1 30); do
    tmo 30 xcrun simctl io "$UDID" screenshot --type=jpeg "$RUNNER_TEMP/probe.jpg" >/dev/null 2>&1
    size=$(stat -f%z "$RUNNER_TEMP/probe.jpg" 2>/dev/null || echo 0)
    if [ "$size" -gt 150000 ]; then
      say "painted after $i probe(s), $size bytes"
      return 0
    fi
    sleep 3
  done
  say "page did not paint within 30 probes: $1"
  return 1
}
