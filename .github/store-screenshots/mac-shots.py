#!/usr/bin/env python3
"""Mac App Store screenshots from the CI build of the real Mac app.

    mac-shots.py <Needt.app> <needt-ci> <cookie file> <ids.json> <out dir>

The same harness as .github/macos-webview/run.py: the CI build (apps/macos/CI)
loads the local web app with the session cookie, takes commands from
`needt-ci send`, and each screen is photographed with `screencapture -l`.
Each screen is photographed only after the page says it is loaded (the harness
`probe:` command: the route is active, no skeleton or aria-busy element on
screen, no request finished in the last second, two probes in a row), then
a short settle. A screen that never gets there is a FAIL line, no file under the
shot's name, and exit code 1.

The window is 1440x900 points; on a Retina display that is 2880x1800 pixels,
which is the Mac App Store size. A runner display that is not Retina gives
1440x900, which is then scaled 2x with sips and marked SCALED in the log: valid
size, but softer than a real Retina capture.
"""
import json
import os
import subprocess
import sys
import time

APP, CI, COOKIE, IDS, OUT = sys.argv[1:6]
BASE = "http://127.0.0.1:3000"
W, H = 1440, 900
TARGET = (2880, 1800)

os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, "mac-shots.log"), "a")


def log(line):
    print(line, flush=True)
    LOG.write(line + "\n")
    LOG.flush()


def ci(*args, timeout=60):
    return subprocess.run([CI, *map(str, args)], capture_output=True, text=True, timeout=timeout)


def send(command, wait=0.0):
    ci("send", command)
    if wait:
        time.sleep(wait)


def window_id():
    for _ in range(60):
        r = ci("window-id")
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
        time.sleep(1)
    return None


PROBES = os.path.join(OUT, "probes")
os.makedirs(PROBES, exist_ok=True)
READY_TIMEOUT = 120
SETTLE = 3


def probe(name, timeout=25):
    path = os.path.join(PROBES, name + ".json")
    if os.path.exists(path):
        os.remove(path)
    send("probe:" + path)
    end = time.time() + timeout
    while time.time() < end:
        if os.path.exists(path) and os.path.getsize(path) > 0:
            try:
                with open(path) as f:
                    return json.load(f)
            except ValueError:
                pass
        time.sleep(0.5)
    return None


def origin_of(p):
    return (((p or {}).get("page") or {}).get("busy") or {}).get("origin")


def loaded(p, want, origin0, quiet=True):
    """The probe says: the page for `want` (a new page load, not the previous
    one), rendered, nothing loading."""
    page = (p or {}).get("page") or {}
    busy = page.get("busy") or {}
    if not busy:
        return False, "no busy facts in the probe"
    problems = []
    if page.get("path") != want:
        problems.append(f"path {page.get('path')!r} != {want!r}")
    if origin0 is not None and busy.get("origin") == origin0:
        problems.append("still the previous page load")
    if busy.get("readyState") != "complete":
        problems.append(f"readyState {busy.get('readyState')}")
    if busy.get("skeletons") != 0:
        problems.append(f"{busy.get('skeletons')} skeleton/busy element(s) on screen")
    if busy.get("imgsPending"):
        problems.append(f"{busy.get('imgsPending')} image(s) pending")
    if busy.get("text", 0) < 60:
        problems.append("almost no text rendered")
    if quiet and not busy.get("bufferFull") and busy.get("sinceLastResource", 0) < 1000:
        problems.append(f"a request finished {busy.get('sinceLastResource')} ms ago")
    return not problems, "; ".join(problems) or "ok"


def wait_loaded(name, want, origin0, limit, need):
    """Poll until `need` probes in a row say loaded. Returns (ok, last reason)."""
    end = time.time() + limit
    streak, i, why = 0, 0, "no probe answered"
    while time.time() < end:
        i += 1
        ok, why = loaded(probe(f"{name}-{i}"), want, origin0)
        streak = streak + 1 if ok else 0
        if streak >= need:
            return True, why
        time.sleep(1)
    return False, why


def pixels(path):
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path], capture_output=True, text=True).stdout
    vals = {}
    for line in out.splitlines():
        parts = line.strip().split(": ")
        if len(parts) == 2 and parts[0] in ("pixelWidth", "pixelHeight"):
            vals[parts[0]] = int(parts[1])
    return vals.get("pixelWidth", 0), vals.get("pixelHeight", 0)


def focus_session(mode):
    r = subprocess.run(["npx", "tsx", ".github/store-screenshots/seed.ts", mode], capture_output=True, text=True)
    log(f"focus {mode}: {(r.stdout + r.stderr).strip()[-200:]}")


try:
    page_id = json.load(open(IDS)).get("pageId")
except (OSError, ValueError):
    page_id = None

SCREENS = [
    ("01-today", "/today"),
    ("02-calendar", "/calendar"),
    ("03-tasks", "/tasks"),
    ("04-page", f"/pages/{page_id}" if page_id else None),
    ("05-habits", "/habits"),
    ("06-focus", "/today"),
]

# Light appearance, the way the iPhone shots are.
subprocess.run(["defaults", "delete", "-g", "AppleInterfaceStyle"], capture_output=True)
subprocess.run(
    ["osascript", "-e", 'tell application "System Events" to tell appearance preferences to set dark mode to false'],
    capture_output=True, text=True, timeout=30,
)

subprocess.run(["pkill", "-x", "Needt"])
time.sleep(2)
focus_session("nofocus")
proc = subprocess.Popen(
    [os.path.join(APP, "Contents/MacOS/Needt"), "--ci-base-url", BASE, "--ci-session-cookie", "@" + COOKIE,
     "--ci-appearance", "light"],
    stdout=open(os.path.join(OUT, "app.log"), "a"),
    stderr=subprocess.STDOUT,
)
wid = window_id()
if not wid:
    log("FAIL no main window (the start window only means the session cookie did not take)")
    subprocess.run(["screencapture", "-x", os.path.join(OUT, "mac-no-window.png")])
    sys.exit(1)

send(f"size:{W}x{H}", 2)
fails = 0
for name, path in SCREENS:
    if not path:
        log(f"skip {name}: no page id")
        continue
    if name == "06-focus":
        focus_session("focus")
    want = path.split("?")[0]
    before = probe(f"{name}-before")
    # A new page load is required unless the app already shows this route (the
    # first screen): then a stale answer cannot be told from a fresh one.
    origin0 = None if ((before or {}).get("page") or {}).get("path") == want else origin_of(before)
    send(f"load:{path}", 1)
    ok, why = wait_loaded(name, want, origin0, READY_TIMEOUT, 2)
    if ok:
        time.sleep(SETTLE)
        # Still the loaded screen after the animations settled.
        ok, why = wait_loaded(name + "-settled", want, origin0, 30, 1)
    wid = window_id() or wid
    raw = os.path.join(OUT, f"raw-{name}.png")
    if not ok:
        log(f"FAIL {name}: {path} never finished loading: {why}")
        subprocess.run(["screencapture", "-x", "-o", "-l", wid, os.path.join(OUT, f"FAILED_mac_{name}.png")], capture_output=True)
        fails += 1
        if name == "06-focus":
            focus_session("nofocus")
        continue
    r = subprocess.run(["screencapture", "-x", "-o", "-l", wid, raw], capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(raw):
        log(f"FAIL screencapture {name}: {r.stderr.strip()}")
        fails += 1
        continue
    # And it was still loaded while the pixels were taken.
    ok, why = loaded(probe(f"{name}-after"), want, origin0, quiet=False)
    if not ok:
        log(f"FAIL {name}: the page was not in a loaded state when the shot was taken: {why}")
        os.replace(raw, os.path.join(OUT, f"FAILED_mac_{name}.png"))
        fails += 1
        continue
    w, h = pixels(raw)
    note = ""
    if (w, h) != TARGET:
        # sips -z takes height then width
        subprocess.run(["sips", "-z", str(TARGET[1]), str(TARGET[0]), raw], capture_output=True)
        note = f" SCALED from {w}x{h}"
    final = os.path.join(OUT, f"mac_{TARGET[0]}x{TARGET[1]}_{name}.png")
    os.replace(raw, final)
    log(f"shot {os.path.basename(final)} ({path}){note} loaded: {why}")
    if name == "06-focus":
        focus_session("nofocus")

send("quit", 2)
try:
    proc.wait(timeout=10)
except subprocess.TimeoutExpired:
    proc.kill()
if fails:
    log(f"FAIL {fails} screen(s) never reached a loaded state (FAILED_mac_*.png and probes/ have the evidence)")
LOG.close()
sys.exit(1 if fails else 0)
