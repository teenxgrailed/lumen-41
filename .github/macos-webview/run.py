#!/usr/bin/env python3
"""Screens of the real Mac app (WKWebView) on a GitHub macOS runner.

    run.py <Needt.app> <needt-ci> <cookie file> <out dir>

The app is the CI build (apps/macos/CI): it loads the local web app with the
session cookie CI got from the credentials endpoint, and takes commands from
`needt-ci send`. For light and dark (macOS appearance, app relaunched) and for
each window size it photographs the window with `screencapture -l` and
measures the page from inside the WKWebView:

  1-home (with the "Task overdue" tip)  2-home-scrolled  2b-tasks
  2c-tasks-scrolled  3-ask  3b-ask-closed  4-connections  5-settings

Every check prints one line to results.txt:
  PASS / FAIL  the harness itself or an assertion the workflow gates on
  BUG          a known owner-reported symptom seen in this run (not gating)
  NOTE         facts worth reading
"""
import json
import os
import subprocess
import sys
import time

APP, CI, COOKIE, OUT = sys.argv[1:5]
BASE = "http://127.0.0.1:3000"
EMAIL = os.environ.get("PROBE_EMAIL", "ci-pro@needt.local")
SIZES = [(1440, 900), (2000, 1300)]
THEMES = ["light", "dark"]
TOP_BAR = 52

SHOTS = os.path.join(OUT, "shots")
PROBES = os.path.join(OUT, "probes")
LOGS = os.path.join(OUT, "logs")
for d in (SHOTS, PROBES, LOGS):
    os.makedirs(d, exist_ok=True)
RESULTS = open(os.path.join(OUT, "results.txt"), "a")


def record(line):
    print(line, flush=True)
    RESULTS.write(line + "\n")
    RESULTS.flush()


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
    record(f"NOTE probe {name} timed out")
    return None


def page(p):
    return (p or {}).get("page") or {}


def ready(name, tries=20):
    p = None
    for _ in range(tries):
        p = probe(name)
        if page(p).get("ready"):
            return p
        time.sleep(2)
    return p


def shot(wid, name):
    path = os.path.join(SHOTS, name + ".png")
    r = subprocess.run(["screencapture", "-x", "-o", "-l", wid, path], capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(path):
        record(f"FAIL screencapture {name}: {r.stderr.strip()}")
        return None
    return path


def check(label, *args, gate=True):
    r = ci(*args)
    out = (r.stdout + r.stderr).strip() or f"exit {r.returncode}"
    for line in out.splitlines():
        if line.startswith("FAIL") and not gate:
            line = "BUG" + line[4:]
        record(f"{line.split(' ', 1)[0]} [{label}] {line.split(' ', 1)[1] if ' ' in line else ''}")


def scale_of(p, png):
    """Pixels per point: the picture width over the window width."""
    try:
        w = (p or {})["window"]["frame"][2]
        out = subprocess.run(["sips", "-g", "pixelWidth", png], capture_output=True, text=True).stdout
        px = int(out.strip().split()[-1])
        return round(px / w, 3)
    except Exception:  # noqa: BLE001
        return 1.0


def reset_nudges():
    """The overdue nudge again undelivered: the corner speaks it once, 9 s
    after the page mounts (TIP_FIRST_MS), then the GET marks it delivered."""
    subprocess.run(
        ["psql", "-h", "localhost", "-U", "needt", "-d", "needt_test", "-qc",
         'update "ProactiveNudge" set "deliveredAt" = null, "readAt" = null'],
        env={**os.environ, "PGPASSWORD": "needt"}, capture_output=True,
    )


def system_appearance(theme):
    """Try the real system switch; the app also gets --ci-appearance."""
    if theme == "dark":
        subprocess.run(["defaults", "write", "-g", "AppleInterfaceStyle", "-string", "Dark"])
    else:
        subprocess.run(["defaults", "delete", "-g", "AppleInterfaceStyle"], capture_output=True)
    r = subprocess.run(
        ["osascript", "-e", 'tell application "System Events" to tell appearance preferences to set dark mode to '
         + ("true" if theme == "dark" else "false")],
        capture_output=True, text=True, timeout=30,
    )
    record(f"NOTE [{theme}] system appearance switch: {'ok' if r.returncode == 0 else r.stderr.strip()[:160]}")


def launch(theme):
    subprocess.run(["pkill", "-x", "Needt"])
    time.sleep(2)
    log = open(os.path.join(LOGS, f"app-{theme}.log"), "a")
    proc = subprocess.Popen(
        [os.path.join(APP, "Contents/MacOS/Needt"), "--ci-base-url", BASE, "--ci-session-cookie", "@" + COOKIE,
         "--ci-appearance", theme],
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    wid = window_id()
    if not wid:
        record(f"FAIL launch {theme}: no main window (start window only means the session cookie did not take)")
        subprocess.run(["screencapture", "-x", os.path.join(SHOTS, f"{theme}-0-screen.png")])
    return proc, wid


def rect_inside(r, w, h):
    return r and r[0] >= 0 and r[1] > 0 and r[0] + r[2] <= w and r[1] + r[3] <= h


for theme in THEMES:
    system_appearance(theme)
    proc, wid = launch(theme)
    if not wid:
        continue
    for w, h in SIZES:
        tag = f"{theme}-{w}x{h}"
        send(f"size:{w}x{h}", 1.5)
        reset_nudges()
        loaded = time.time()
        send("load:/today", 3)
        home = ready(f"{tag}-1-home")
        hp = page(home)
        if not hp.get("ready"):
            record(f"FAIL [{tag}] Home never showed its top bar and Ask pill (path {hp.get('path')}, session {hp.get('session')})")
            shot(wid, f"{tag}-1-home-not-ready")
            continue
        # The entrance settles and the overdue nudge reaches the corner (9 s
        # after mount, shown for 8 s).
        time.sleep(max(2.0, 11.5 - (time.time() - loaded)))
        home = probe(f"{tag}-1-home")
        hp = page(home)
        wid = window_id() or wid
        home_png = shot(wid, f"{tag}-1-home")
        if not home_png:
            continue
        s = scale_of(home, home_png)
        win = home["window"]
        record(
            f"NOTE [{tag}] window {win['frame']} on screen {win['screen']} scale {s}; "
            f"viewport {hp.get('viewport')}; session {hp.get('session')}; shell {hp.get('shell')}; "
            f"theme {hp.get('theme')} dark={hp.get('dark')} appearance {win.get('appearance')}"
        )
        record(("PASS" if hp.get("session") == EMAIL else "FAIL") + f" [{tag}] signed in as {hp.get('session')}")
        record(("PASS" if hp.get("shell") == "swift" else "FAIL") + f" [{tag}] page sees the Swift shell ({hp.get('shell')})")
        vw, vh = (hp.get("viewport") or [w, h])[:2]
        record(("PASS" if abs(vw - w) <= 1 and abs(vh - h) <= 1 else "FAIL") + f" [{tag}] viewport {vw}x{vh}")

        check(f"{tag} home", "edge", home_png, s)
        pill = hp.get("pill") or {}
        r = pill.get("rect")
        if r:
            record(
                ("PASS" if rect_inside(r, vw, vh) and pill.get("onTop") and "Ask Needt" in pill.get("text", "") else "BUG")
                + f" [{tag}] Ask pill rect {r} onTop={pill.get('onTop')} text={pill.get('text')!r} layerOpacity={pill.get('layerOpacity')}"
            )
            check(f"{tag} Ask pill painted", "region", home_png, s, *r)
        else:
            record(f"FAIL [{tag}] no Ask pill in the DOM")
        corner = hp.get("corner")
        if corner:
            vis = corner.get("visible") or [0, 0]
            big = vis[0] > 376 or (corner.get("anchor") or [0, 0, 0, 0])[2] > 376
            record(("BUG" if big or corner.get("topLeftIsShell") and corner.get("clipPath") != "none" else "PASS")
                   + f" [{tag}] corner shell {corner.get('shell')} visible {vis} anchor {corner.get('anchor')} clip {corner.get('clipPath')} topLeftIsShell={corner.get('topLeftIsShell')}")
        record(("PASS" if not hp.get("ghosts") else "BUG") + f" [{tag}] ghost boxes: {hp.get('ghosts')}")
        for sky in hp.get("skies") or []:
            record(f"NOTE [{tag}] home sky {sky.get('where')} root {sky.get('root')} canvas {sky.get('canvas')} backing {sky.get('backing')} distinct {sky.get('distinct')}")
            check(f"{tag} home sky painted across", "strips", home_png, s, *sky["root"], gate=False)

        # Scroll the main pane with the wheel.
        send("wheel:15", 2)
        scrolled = probe(f"{tag}-2-home-scrolled")
        sp = page(scrolled)
        scrolled_png = shot(wid, f"{tag}-2-home-scrolled")
        if scrolled_png:
            check(f"{tag} top bar after wheel", "frame", home_png, scrolled_png, s, TOP_BAR)
            check(f"{tag} home scrolled", "edge", scrolled_png, s)
        hf, sf = hp.get("frame") or {}, sp.get("frame") or {}
        moved = [(a, b) for a, b in zip(hp.get("scrollers") or [], sp.get("scrollers") or []) if a.get("top") != b.get("top")]
        record(f"NOTE [{tag}] scrollers before {hp.get('scrollers')} after {sp.get('scrollers')}")
        record(("PASS" if sf.get("doc") == 0 else "BUG") + f" [{tag}] document scrollTop after wheel: {sf.get('doc')} (chain {sf.get('chainScrollTop')})")
        record(("PASS" if sf.get("topBar") == hf.get("topBar") and sf.get("rail") == hf.get("rail") else "BUG")
               + f" [{tag}] top bar {hf.get('topBar')} -> {sf.get('topBar')}, rail {hf.get('rail')} -> {sf.get('rail')}")
        record(("PASS" if moved else "NOTE") + f" [{tag}] the wheel {'scrolled a pane' if moved else 'scrolled no pane'}")

        # Tasks: 31 rows, a pane that really scrolls.
        send("load:/tasks", 3)
        tasks = ready(f"{tag}-2b-tasks")
        time.sleep(2)
        tasks = probe(f"{tag}-2b-tasks")
        tasks_png = shot(wid, f"{tag}-2b-tasks")
        send("wheel:15", 2)
        tasks_after = probe(f"{tag}-2c-tasks-scrolled")
        tasks_after_png = shot(wid, f"{tag}-2c-tasks-scrolled")
        if tasks_png and tasks_after_png:
            check(f"{tag} top bar after wheel on Tasks", "frame", tasks_png, tasks_after_png, s, TOP_BAR)
            check(f"{tag} tasks scrolled", "edge", tasks_after_png, s)
        tp, tap = page(tasks), page(tasks_after)
        moved = [(a, b) for a, b in zip(tp.get("scrollers") or [], tap.get("scrollers") or []) if a.get("top") != b.get("top")]
        record(f"NOTE [{tag}] tasks scrollers before {tp.get('scrollers')} after {tap.get('scrollers')}")
        taf = tap.get("frame") or {}
        record(("PASS" if taf.get("doc") == 0 else "BUG") + f" [{tag}] Tasks: document scrollTop after wheel {taf.get('doc')} (chain {taf.get('chainScrollTop')})")
        record(("PASS" if taf.get("topBar") == (tp.get("frame") or {}).get("topBar") else "BUG") + f" [{tag}] Tasks: top bar {(tp.get('frame') or {}).get('topBar')} -> {taf.get('topBar')}")
        record(("PASS" if moved else "NOTE") + f" [{tag}] Tasks: the wheel {'scrolled ' + moved[0][0]['el'] if moved else 'scrolled no pane'}")

        # Ask Needt (Command-J).
        send("load:/today", 3)
        ready(f"{tag}-3-ask-before")
        time.sleep(2)
        send("key:cmd+j", 2.5)
        ask = probe(f"{tag}-3-ask")
        ask_png = shot(wid, f"{tag}-3-ask")
        ap = page(ask)
        record(("PASS" if ap.get("chatPanel") else "BUG") + f" [{tag}] Command-J opened the Ask panel: {ap.get('chatPanel')}")
        if ask_png and ap.get("chatPanel"):
            check(f"{tag} Ask panel painted", "region", ask_png, s, *ap["chatPanel"], gate=False)
        send("key:escape", 1.5)
        closed = probe(f"{tag}-3b-ask-closed")
        shot(wid, f"{tag}-3b-ask-closed")
        cl = page(closed)
        record(("PASS" if not cl.get("ghosts") and not cl.get("chatPanel") else "BUG")
               + f" [{tag}] after Escape: panel {cl.get('chatPanel')} ghosts {cl.get('ghosts')} corner {(cl.get('corner') or {}).get('visible')}")

        # Connections.
        send("load:/connections", 3)
        conn = ready(f"{tag}-4-connections")
        time.sleep(4)
        conn = probe(f"{tag}-4-connections")
        cp = page(conn)
        conn_png = shot(wid, f"{tag}-4-connections")
        t = cp.get("title")
        if t:
            title_bottom = t["title"][1] + t["title"][3]
            glyph_bottom = t["glyphs"][1] + t["glyphs"][3]
            sub_top = t["sub"][1]
            ok = title_bottom <= sub_top and glyph_bottom <= sub_top + 1
            record(("PASS" if ok else "BUG") + f" [{tag}] /connections title {t['title']} glyphs {t['glyphs']} subtitle {t['sub']} line-height {t.get('lineHeight')}")
        else:
            record(f"NOTE [{tag}] /connections has no .cn-h1/.cn-screen-text-5 (path {cp.get('path')})")
        if conn_png:
            check(f"{tag} connections", "edge", conn_png, s)
            for sky in cp.get("skies") or []:
                record(f"NOTE [{tag}] connections sky root {sky.get('root')} canvas {sky.get('canvas')} dot {sky.get('dot')} backing {sky.get('backing')} distinct {sky.get('distinct')}")
                check(f"{tag} connections sky painted across", "strips", conn_png, s, *sky["root"], gate=False)

        # Settings (Command-comma, the app menu's Settings item).
        send("load:/today", 3)
        ready(f"{tag}-5-settings-before")
        time.sleep(2)
        send("key:cmd+,", 3.5)
        settings = probe(f"{tag}-5-settings")
        shot(wid, f"{tag}-5-settings")
        record(f"NOTE [{tag}] settings sheet open: {page(settings).get('settingsOpen')} path {page(settings).get('path')}")
        send("key:escape", 1)

    # How smooth a wheel scroll is in this WKWebView (the runner has no GPU of
    # its own, so this is indicative only).
    send("load:/today", 3)
    ready(f"{theme}-fps-before")
    time.sleep(2)
    fps_path = os.path.join(PROBES, f"{theme}-wheel-fps.json")
    send("wheelfps:" + fps_path)
    for _ in range(30):
        if os.path.exists(fps_path):
            break
        time.sleep(0.5)
    try:
        with open(fps_path) as f:
            record(f"NOTE [{theme}] animation frames during a wheel scroll: {json.load(f).get('page')}")
    except (OSError, ValueError):
        record(f"NOTE [{theme}] no frame timing")

    send("quit", 2)
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

subprocess.run(["defaults", "delete", "-g", "AppleInterfaceStyle"], capture_output=True)
RESULTS.close()
