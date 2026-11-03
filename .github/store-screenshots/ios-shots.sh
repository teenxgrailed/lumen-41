#!/usr/bin/env bash
# App Store screenshots of the iOS shell, one Simulator per device class.
#
#   ios-shots.sh <App.app> <out dir> <scratch dir> <ids.json>
#
# The app is the CI build (apps/ios/ci/capacitor.config.ci.json): it opens
# http://127.0.0.1:3001/, which login-server.mjs answers with the session cookie
# and a redirect to the screen named in <scratch>/target. So every screen is a
# relaunch with a new target. Run from the repository root with the web app on
# :3000 and login-server.mjs on :3001 (it must read the file <scratch>/target);
# DATABASE_URL set (the focus session is written there).
#
# A shot is taken only when the page itself says it is ready: the page injected
# by login-server.mjs reports its route, the loading skeletons still on screen
# and the requests still in flight to /__state, and wait_ready below polls that.
# A screen that is not ready in time is a FAIL line in the log, no file under
# the shot's name, and a non-zero exit.
set -uo pipefail

APP="$1"
OUT="$2"
TMP="$3"
IDS="$4"
BUNDLE=app.needt.ios
TARGET_FILE="$TMP/target"
mkdir -p "$OUT" "$TMP"
LOG="$OUT/ios-shots.log"
: > "$LOG"
log() { echo "$*" | tee -a "$LOG"; }
FAILS=0
STATE_URL=http://127.0.0.1:3001/__state
# Seconds a screen gets per launch (a cold Simulator is slow), tries per screen,
# and the pause after "ready" for animations to finish.
READY_TIMEOUT="${READY_TIMEOUT:-75}"
READY_TRIES="${READY_TRIES:-2}"
SETTLE="${SETTLE:-3}"

# state_ok <expected path> <state json> [loose]: exit 0 when the screen is on
# that route, rendered, with no skeleton, nothing in flight and the report
# fresh. "loose" ignores requests in flight (a background refetch is not a
# loading screen).
state_ok() {
  printf '%s' "$2" | python3 -I -c '
import json, sys
want = sys.argv[1].split("?")[0]
try:
    s = json.load(sys.stdin)
except ValueError:
    sys.exit(1)
ok = (
    s.get("ageMs", 10**9) <= 3000
    and s.get("path") == want
    and s.get("readyState") == "complete"
    and s.get("scope") is True
    and s.get("text", 0) >= 60
    and s.get("skeletons") == 0
    and s.get("imgsPending") == 0
)
if ok and not (len(sys.argv) > 2 and sys.argv[2] == "loose"):
    ok = s.get("inflight") == 0 and s.get("idleMs", 0) >= 800
sys.exit(0 if ok else 1)
' "$1" "${3:-}"
}

# wait_ready <path> <timeout s> <consecutive polls needed>; sets LAST_STATE
wait_ready() {
  local want="$1" limit="$2" need="$3" t0=$SECONDS ok=0 out=""
  while [ $((SECONDS - t0)) -lt "$limit" ]; do
    out="$(curl -fsS --max-time 3 "$STATE_URL" 2>/dev/null || true)"
    LAST_STATE="$out"
    if state_ok "$want" "$out"; then
      ok=$((ok + 1))
      [ "$ok" -ge "$need" ] && return 0
    else
      ok=0
    fi
    sleep 1
  done
  return 1
}

PAGE_ID="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get("pageId") or "")' "$IDS" 2>/dev/null || true)"
log "page id: ${PAGE_ID:-none}"

# name:path ; @page and @focus are resolved below
SCREENS=("01-today:/today" "02-calendar:/calendar" "03-tasks:/tasks" "04-page:@page" "05-habits:/habits" "06-focus:@focus")

# pick <candidate names, | separated>  ->  "<runtime id>|<device type id>|<name>" or nothing
pick_device() {
  xcrun simctl list runtimes -j > "$TMP/runtimes.json"
  python3 -I - "$TMP/runtimes.json" "$1" <<'PY'
import json, re, sys
rts = [r for r in json.load(open(sys.argv[1]))["runtimes"]
       if r.get("platform") == "iOS" and r.get("isAvailable", True)]
rts.sort(key=lambda r: [int(p) for p in re.findall(r"\d+", r["version"])])
if not rts:
    sys.exit(0)
rt = rts[-1]
types = {d["name"]: d["identifier"] for d in rt["supportedDeviceTypes"]}
for name in sys.argv[2].split("|"):
    if name in types:
        print(f'{rt["identifier"]}|{types[name]}|{name}')
        break
else:
    print("available: " + ", ".join(sorted(types)), file=sys.stderr)
PY
}

clear_focus() { npx tsx .github/store-screenshots/seed.ts nofocus >> "$LOG" 2>&1 || log "WARN could not clear the focus session"; }

# shoot_device <label> <candidate names>
shoot_device() {
  local label="$1" found runtime devtype name udid
  found="$(pick_device "$2" 2>>"$LOG")"
  if [ -z "$found" ]; then
    log "NO DEVICE for $label (wanted: $2); see the list in $LOG"
    return 1
  fi
  runtime="${found%%|*}"; found="${found#*|}"; devtype="${found%%|*}"; name="${found#*|}"
  log "== $label: $name ($devtype) on $runtime"
  udid="$(xcrun simctl create "store-$label" "$devtype" "$runtime")" || { log "create failed for $label"; return 1; }
  xcrun simctl boot "$udid" || true
  xcrun simctl bootstatus "$udid" -b >> "$LOG" 2>&1 || true
  xcrun simctl ui "$udid" appearance light || true
  xcrun simctl status_bar "$udid" override --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100 || log "WARN status bar override failed on $label"
  xcrun simctl install "$udid" "$APP" || { log "install failed on $label"; return 1; }
  clear_focus
  # What the page says when it fails (Capacitor prints JS console output to the
  # system log): kept per device next to the shots.
  xcrun simctl spawn "$udid" log stream --style compact --level debug --predicate 'process == "App"' > "$OUT/console-$label.log" 2>&1 &
  local logpid=$!

  local entry n path raw w h
  for entry in "${SCREENS[@]}"; do
    n="${entry%%:*}"; path="${entry#*:}"
    case "$path" in
      @page)
        if [ -z "$PAGE_ID" ]; then log "skip $n: no page id"; continue; fi
        path="/pages/$PAGE_ID" ;;
      @focus)
        npx tsx .github/store-screenshots/seed.ts focus >> "$LOG" 2>&1 || log "WARN could not start a focus session"
        path="/today" ;;
    esac
    local want="${path%%\?*}" tries=0 ready=0 out=""
    LAST_STATE=""
    while [ "$tries" -lt "$READY_TRIES" ]; do
      tries=$((tries + 1))
      xcrun simctl terminate "$udid" "$BUNDLE" 2>/dev/null || true
      # Forget what the previous launch reported, then point the login redirect
      # at this screen and start the app.
      curl -fsS --max-time 5 "$STATE_URL?reset=1" > /dev/null 2>&1 || log "WARN could not reset $STATE_URL"
      printf '%s' "$path" > "$TARGET_FILE"
      xcrun simctl launch "$udid" "$BUNDLE" >> "$LOG" 2>&1 || log "WARN launch failed for $n on $label"
      if wait_ready "$want" "$READY_TIMEOUT" 3; then ready=1; break; fi
      log "WARN $label $n not ready after ${READY_TIMEOUT}s (try $tries/$READY_TRIES): $LAST_STATE"
    done
    raw="$TMP/raw-$label-$n.png"
    if [ "$ready" != "1" ]; then
      log "FAIL $label $n: $path never finished loading; last state: $LAST_STATE"
      xcrun simctl io "$udid" screenshot --type=png "$OUT/FAILED_${label}_${n}.png" >> "$LOG" 2>&1 || true
      FAILS=$((FAILS + 1))
      continue
    fi
    # Let transitions finish, then confirm it is still the loaded screen.
    sleep "$SETTLE"
    if ! wait_ready "$want" 15 1; then
      log "FAIL $label $n: $path went back to loading before the shot; last state: $LAST_STATE"
      FAILS=$((FAILS + 1))
      continue
    fi
    xcrun simctl io "$udid" screenshot --type=png "$raw" >> "$LOG" 2>&1 || { log "FAIL screenshot: $label $n"; FAILS=$((FAILS + 1)); continue; }
    # And that it was still loaded while the pixels were taken.
    out="$(curl -fsS --max-time 3 "$STATE_URL" 2>/dev/null || true)"
    if ! state_ok "$want" "$out" loose; then
      log "FAIL $label $n: the page was not in a loaded state when the shot was taken: $out"
      mv "$raw" "$OUT/FAILED_${label}_${n}.png"
      FAILS=$((FAILS + 1))
      continue
    fi
    w="$(sips -g pixelWidth "$raw" | awk '/pixelWidth/ {print $2}')"
    h="$(sips -g pixelHeight "$raw" | awk '/pixelHeight/ {print $2}')"
    mv "$raw" "$OUT/${label}_${w}x${h}_${n}.png"
    log "shot ${label}_${w}x${h}_${n}.png ($path)"
    [ "$n" = "06-focus" ] && clear_focus
  done
  kill "$logpid" 2>/dev/null || true
  xcrun simctl shutdown "$udid" || true
  xcrun simctl delete "$udid" || true
}

# STORE_ONLY=<label> runs a single device class (for debugging a run).
want() { [ -z "${STORE_ONLY:-}" ] || [ "$STORE_ONLY" = "$1" ]; }
want iphone-69 && shoot_device iphone-69 "iPhone 17 Pro Max|iPhone 16 Pro Max"
want iphone-65 && shoot_device iphone-65 "iPhone 14 Plus|iPhone 11 Pro Max|iPhone XS Max|iPhone 15 Plus"
HAVE_65="$(find "$OUT" -name 'iphone-65_*' | wc -l | tr -d ' ')"
want ipad-13 && shoot_device ipad-13 "iPad Pro 13-inch (M5)|iPad Pro 13-inch (M4)|iPad Pro (12.9-inch) (6th generation)"

# 6.5" slot: App Store Connect also takes the 6.9" set for it; if no 6.5" device
# exists on this runner, scale the 6.9" shots (0.4% aspect difference) and say so.
if [ "$HAVE_65" = "0" ] && want iphone-65; then
  log "NOTE iphone-65: no 6.5-inch device on this runner; scaled from the 6.9-inch shots"
  for f in "$OUT"/iphone-69_*.png; do
    [ -e "$f" ] || continue
    n="$(basename "$f" .png)"; n="${n#iphone-69_*x*_}"
    cp "$f" "$TMP/scale.png"
    sips -z 2778 1284 "$TMP/scale.png" >> "$LOG" 2>&1 && mv "$TMP/scale.png" "$OUT/iphone-65_1284x2778_${n}.png"
    echo "scaled" > "$OUT/.scaled-iphone-65"
  done
fi
ls -l "$OUT"
if [ "$FAILS" -gt 0 ]; then
  log "FAIL $FAILS screen(s) never reached a loaded state (FAILED_*.png and console-*.log have the evidence)"
  exit 1
fi
