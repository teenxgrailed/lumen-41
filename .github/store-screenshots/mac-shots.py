#!/usr/bin/env python3
"""Mac App Store screenshots from the CI build of the real Mac app.

    mac-shots.py <Needt.app> <needt-ci> <cookie file> <ids.json> <out dir>

The same harness as .github/macos-webview/run.py: the CI build (apps/macos/CI)
loads the local web app with the session cookie, takes commands from
`needt-ci send`, and each screen is photographed with `screencapture -l`.
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
for name, path in SCREENS:
    if not path:
        log(f"skip {name}: no page id")
        continue
    if name == "06-focus":
        focus_session("focus")
    send(f"load:{path}", 3)
    time.sleep(14)
    wid = window_id() or wid
    raw = os.path.join(OUT, f"raw-{name}.png")
    r = subprocess.run(["screencapture", "-x", "-o", "-l", wid, raw], capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(raw):
        log(f"FAIL screencapture {name}: {r.stderr.strip()}")
        continue
    w, h = pixels(raw)
    note = ""
    if (w, h) != TARGET:
        # sips -z takes height then width
        subprocess.run(["sips", "-z", str(TARGET[1]), str(TARGET[0]), raw], capture_output=True)
        note = f" SCALED from {w}x{h}"
    final = os.path.join(OUT, f"mac_{TARGET[0]}x{TARGET[1]}_{name}.png")
    os.replace(raw, final)
    log(f"shot {os.path.basename(final)} ({path}){note}")
    if name == "06-focus":
        focus_session("nofocus")

send("quit", 2)
try:
    proc.wait(timeout=10)
except subprocess.TimeoutExpired:
    proc.kill()
LOG.close()
