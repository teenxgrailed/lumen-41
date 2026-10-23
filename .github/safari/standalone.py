#!/usr/bin/env python3
"""The Safari phone probe in the INSTALLED app (Add to Home Screen, standalone).
  standalone.py install            Safari > Share > Add to Home Screen, then open it
  standalone.py signin EMAIL PASS  the sign-in form, inside the installed app
  standalone.py scenarios          the tab scenarios again, light and dark
  standalone.py nav                Home > Tasks > a doc > Settings > back

Shots land in shots/standalone-*.png; every one gets the edge-band check
(edges.py) and a chrome check: the page's navigator.standalone and
innerHeight through Web Inspector (wi.py), plus the native controls idb sees
(an in-app Safari view brings Done / the address). Findings go to
shots/standalone-report.txt; a band or Safari chrome is an ::error::.
Pages are reached by location.assign in the scenarios and by real taps on the
menu in nav (its targets are found through Web Inspector, the touch is idb)."""
import json, os, subprocess, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ui  # noqa: E402
import wi  # noqa: E402

UDID = os.environ["UDID"]
HOST = "http://127.0.0.1:3000"
NAME = "Needt"
HERE = os.path.dirname(os.path.abspath(__file__))
REPORT = "shots/standalone-report.txt"
# native controls that only exist when Safari's own chrome is on screen
CHROME = ("done", "address", "reload", "url", "open in safari", "back", "forward",
          "tabs", "show tabs", "page menu", "more", "share", "aa", "website settings")


def log(line):
    print(line, flush=True)
    with open(REPORT, "a") as f:
        f.write(line + "\n")


def sh(*cmd, timeout=150):
    try:
        return subprocess.run(list(cmd), capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(cmd, 124, "", "timeout")


def js(code, want="webapp"):
    try:
        return wi.evaluate(code, want, "127.0.0.1:3000")["value"]
    except SystemExit as e:
        print("wi:", e, flush=True)
        return None


STATE_JS = """
const pill = document.querySelector('[data-nva-pill]');
const r = pill && pill.getBoundingClientRect();
const cs = getComputedStyle(document.documentElement);
return {standalone: navigator.standalone === true,
        displayMode: matchMedia('(display-mode: standalone)').matches,
        innerHeight, innerWidth, screenH: screen.height, path: location.pathname + location.hash,
        ground: cs.backgroundColor, theme: (document.querySelector('.needt-v3') || {}).dataset?.theme,
        dockGap: r ? Math.round(innerHeight - r.bottom) : null, scrollY: Math.round(scrollY)};
"""


def state():
    return js(STATE_JS) or {}


def native_chrome():
    els = ui.describe()
    found = sorted({ui.label(e) for e in els if ui.label(e) in CHROME and e.get("type") != "Application"})
    return found, els


BASE = {}
PROBLEMS = []


def check(name, theme, before=None):
    path = f"shots/{name}.png"
    sh("xcrun", "simctl", "io", UDID, "screenshot", path)
    s = state()
    chrome, els = native_chrome()
    if "innerHeight" not in BASE and s.get("innerHeight"):
        BASE["innerHeight"] = s["innerHeight"]
    with open("debug/standalone-state.jsonl", "a") as f:
        f.write(json.dumps({"shot": name, "state": s, "native": chrome}) + "\n")
    log(f"{name}: standalone={s.get('standalone')} displayMode={s.get('displayMode')} "
        f"innerHeight={s.get('innerHeight')} screen={s.get('screenH')} path={s.get('path')} "
        f"dockGap={s.get('dockGap')} ground={s.get('ground')} native={chrome}")
    shrunk = BASE.get("innerHeight") and s.get("innerHeight") and s["innerHeight"] < BASE["innerHeight"] - 4
    if chrome or s.get("standalone") is False or shrunk:
        msg = f"{name}: Safari chrome (native {chrome}, standalone={s.get('standalone')}, innerHeight {s.get('innerHeight')} vs {BASE.get('innerHeight')})"
        PROBLEMS.append(msg)
        print(f"::error title=Safari chrome in the installed app::{msg}", flush=True)
        ui.save_debug(f"chrome-{name}", els)
    r = sh("python3", os.path.join(HERE, "edges.py"), path, theme)
    for line in r.stdout.splitlines():
        if line.startswith("EDGE"):
            log("  " + line)
    if r.returncode == 1:
        PROBLEMS.append(f"{name}: edge band")
        print(r.stdout[r.stdout.find("::error"):], flush=True)
    if before:
        log("  " + region_diff(before, path))
    return path


def region_diff(a, b):
    """Mean difference of the top and bottom 100 px between two shots."""
    from PIL import Image, ImageChops, ImageStat
    ia, ib = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    if ia.size != ib.size:
        return f"size changed {ia.size} -> {ib.size}"
    w, h = ia.size
    out = []
    for nm, box in (("top100", (0, 0, w, 100)), ("bottom100", (0, h - 100, w, h))):
        d = ImageStat.Stat(ImageChops.difference(ia.crop(box), ib.crop(box))).mean
        out.append(f"{nm} diff {sum(d) / 3:.1f}")
    return f"vs {os.path.basename(a)}: " + ", ".join(out)


def painted(path=None, secs=60):
    end = time.time() + secs
    while time.time() < end:
        v = js("return {ready: document.readyState, path: location.pathname, "
               "phone: !!document.querySelector('.needt-v3[data-ui=\"phone\"]')}")
        if v and v["ready"] == "complete" and v["phone"] and (not path or v["path"] == path.split("#")[0]):
            time.sleep(4)
            return True
        time.sleep(3)
    print(f"not painted: {path}", flush=True)
    return False


def go(path):
    js(f"location.assign({json.dumps(path)}); return true")
    time.sleep(3)
    painted(path)


def rect(selectors):
    sel = json.dumps(selectors)
    return js(f"""
for (const s of {sel}) {{
  for (const el of document.querySelectorAll(s)) {{
    const r = el.getBoundingClientRect();
    if (r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight)
      return {{s, x: r.left + r.width / 2, y: r.top + r.height / 2}};
  }}
}}
return null;""")


def tap_sel(selectors, what):
    r = rect(selectors)
    if not r:
        log(f"  no target for {what} ({selectors})")
        return False
    ui.tap(r["x"], r["y"])  # the installed app has no bar above the page: CSS px are points
    log(f"  tapped {what} at {r['x']:.0f},{r['y']:.0f} ({r['s']})")
    time.sleep(5)
    return True


def place(pid):
    """Go to a place through menu A: its dock icon, or the card's tile / row."""
    if tap_sel([f'[data-nva-icon="{pid}"]'], pid):
        return True
    tap_sel(["[data-nva-open]"], "every place")
    time.sleep(2)
    return tap_sel([f'[data-nva-tile="{pid}"]', f'[data-nva-row="{pid}"]'], pid)


# ---------------------------------------------------------------- commands

def install():
    sh("xcrun", "simctl", "ui", UDID, "appearance", "light")
    for _ in range(4):
        if sh("xcrun", "simctl", "openurl", UDID, HOST + "/today", timeout=60).returncode == 0:
            break
        time.sleep(10)
    time.sleep(20)
    w, h = ui.screen()
    method = None
    if ui.add_to_home_screen(w, h) and ui.launch_icon(NAME, w, h):
        method = "share-sheet"
    else:
        ui.install_webclip(NAME, HOST + "/today", "public/icons/apple-touch-icon.png")
        if ui.launch_icon(NAME, w, h):
            method = "webclip"
    time.sleep(10)
    s = state()
    log(f"install: method={method} front={ui.front_app()} state={json.dumps(s)}")
    with open("debug/standalone-method.txt", "w") as f:
        f.write(f"{method}\n")
    ui.save_debug("standalone-launched", ui.describe())
    sys.exit(0 if method else 1)


def signin(email, password):
    for attempt in range(1, 4):
        v = js("return location.pathname") or ""
        log(f"signin attempt {attempt}: the installed app is at {v!r}")
        if v and not v.startswith("/auth"):
            log("signin: signed in" + (" (Safari's session came along)" if attempt == 1 else ""))
            return
        signin_once(email, password)
        time.sleep(25)
    v = js("return location.pathname") or ""
    ok = v and not v.startswith("/auth")
    log(f"signin: {'signed in' if ok else 'NOT signed in'}, at {v!r}")
    if not ok:
        print("::error::Could not sign in inside the installed app", flush=True)
        sys.exit(1)


def signin_once(email, password):
    if not (js("return location.pathname") or "").startswith("/auth/signin"):
        js("location.assign('/auth/signin'); return 1")
        time.sleep(8)
    painted_form = False
    for _ in range(20):
        if rect(['input[type="email"]', 'input[name="email"]']):
            painted_form = True
            break
        time.sleep(3)
    if not painted_form:
        log("signin: no form found through Web Inspector; tab coordinates")
        sh("python3", os.path.join(HERE, "ui.py"), "signin", email, password, timeout=420)
        return
    for sel, text in ((['input[type="email"]', 'input[name="email"]'], email),
                      (['input[type="password"]'], password)):
        for _ in range(2):  # a touch can be swallowed; a second on a focused field is harmless
            tap_sel(sel, sel[0])
        time.sleep(3)
        ui.type_slowly(text)
        time.sleep(5)
    sh("xcrun", "simctl", "io", UDID, "screenshot", "shots/standalone-00-signin.png")
    ui.idb("ui", "key", "40", check=False)


def scenarios():
    os.makedirs("debug", exist_ok=True)
    for theme in ("light", "dark"):
        sh("xcrun", "simctl", "ui", UDID, "appearance", theme)
        time.sleep(3)
        go("/today")
        check(f"standalone-{theme}-01-today-top", theme)
        ui.idb("ui", "swipe", "201", "542", "201", "140", "--duration", "0.25", check=False)
        time.sleep(2)
        check(f"standalone-{theme}-02-today-scrolled", theme)
        go("/tasks")
        check(f"standalone-{theme}-03-tasks-top", theme)
        for _ in range(12):
            ui.idb("ui", "swipe", "201", "542", "201", "140", "--duration", "0.25", check=False)
            time.sleep(0.5)
        time.sleep(1)
        check(f"standalone-{theme}-04-tasks-bottom", theme)
        go("/settings#appearance")
        check(f"standalone-{theme}-05-settings-sheet", theme)
        # pull-down, shot while the finger is still down
        go("/today")
        p = subprocess.Popen(["idb", "ui", "swipe", "201", "140", "201", "520", "--duration", "4", "--udid", UDID])
        time.sleep(2.5)
        sh("xcrun", "simctl", "io", UDID, "screenshot", f"shots/standalone-{theme}-06-pull-down.png")
        p.wait(timeout=60)
        time.sleep(2)
        # the Focus button only exists while a session runs
        sh("npx", "tsx", os.path.join(HERE, "seed-focus.ts"), "running", timeout=120)
        go("/today")
        check(f"standalone-{theme}-07-focus-running", theme)
        sh("npx", "tsx", os.path.join(HERE, "seed-focus.ts"), "none", timeout=120)
    finish()


def nav():
    sh("xcrun", "simctl", "ui", UDID, "appearance", "light")
    time.sleep(3)
    go("/today")
    prev = check("standalone-nav-1-home", "light")
    place("tasks")
    painted("/tasks")
    prev = check("standalone-nav-2-tasks", "light", prev)
    place("docs")
    painted()
    check("standalone-nav-3a-docs", "light", prev)
    tap_sel(["[data-pd-card]"], "the doc")
    painted()
    prev = check("standalone-nav-3-doc", "light", prev)
    tap_sel(["[data-nva-open]"], "every place")
    time.sleep(2)
    tap_sel(['[data-nva-tile="settings"]', '[data-nva-row="settings"]'], "settings")
    time.sleep(3)
    prev = check("standalone-nav-4-settings", "light", prev)
    # back: close the sheet the way a person does (the edge swipe), then history
    w, h = ui.screen()
    ui.swipe(2, h * 0.5, w * 0.7, h * 0.5, 0.3)
    time.sleep(4)
    prev = check("standalone-nav-5-back-swipe", "light", prev)
    js("history.back(); return 1")
    time.sleep(3)
    painted()
    check("standalone-nav-6-back", "light", prev)
    finish()


def finish():
    if PROBLEMS:
        log("PROBLEMS: " + "; ".join(PROBLEMS))
        with open("debug/standalone-problems.txt", "a") as f:
            f.write("\n".join(PROBLEMS) + "\n")
    else:
        log("no edge band, no Safari chrome")


if __name__ == "__main__":
    os.makedirs("shots", exist_ok=True)
    os.makedirs("debug", exist_ok=True)
    cmd, args = sys.argv[1], sys.argv[2:]
    {"install": lambda: install(), "signin": lambda: signin(*args),
     "scenarios": lambda: scenarios(), "nav": lambda: nav()}[cmd]()
