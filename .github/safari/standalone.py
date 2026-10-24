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
import json, os, re, signal, subprocess, sys, time

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
    ui.stamp(line)
    with open(REPORT, "a") as f:
        f.write(line + "\n")


def sh(*cmd, timeout=90):
    # every external call is killed (with its process group) after `timeout`
    # seconds and reports returncode 124; nothing here can block the step
    return ui.hard_run(cmd, timeout=timeout)


def js(code, want="webapp", url="127.0.0.1:3000"):
    try:
        return wi.evaluate(code, want, url)["value"]
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
        dockGap: r ? Math.round(innerHeight - r.bottom) : null, scrollY: Math.round(scrollY),
        sheet: !!document.querySelector('.pk-sheet-layer.is-open')};
"""

# why the layout viewport is shorter than the screen (the Settings sheet case)
VIEWPORT_JS = """
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;' +
  'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
document.body.appendChild(probe);
const len = (v) => { probe.style.height = v; return probe.getBoundingClientRect().height; };
const ps = getComputedStyle(probe);
const out = {vv: visualViewport && Math.round(visualViewport.height), vvTop: visualViewport && Math.round(visualViewport.offsetTop),
  clientH: document.documentElement.clientHeight, scrollH: document.documentElement.scrollHeight,
  vh: len('100vh'), dvh: len('100dvh'), svh: len('100svh'), lvh: len('100lvh'),
  sat: ps.paddingTop, sab: ps.paddingBottom,
  htmlOverflow: getComputedStyle(document.documentElement).overflow, bodyOverflow: getComputedStyle(document.body).overflow,
  bodyPos: getComputedStyle(document.body).position, htmlStyle: document.documentElement.getAttribute('style'),
  bodyStyle: document.body.getAttribute('style'),
  statusMeta: [...document.querySelectorAll('meta[name="apple-mobile-web-app-status-bar-style"]')].map(m => (m.closest('head') ? 'head:' : 'body:') + m.content),
  viewportMeta: [...document.querySelectorAll('meta[name="viewport"]')].map(m => m.content),
  active: document.activeElement && (document.activeElement.tagName + '.' + document.activeElement.className).slice(0, 80)};
probe.remove();
return out;
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
    # Safari's in-app view is a remote view idb cannot see: its bar shows the
    # host name at the top, which OCR reads
    w, h = ui.screen()
    os.makedirs("debug", exist_ok=True)
    sh("cp", path, f"debug/ocr-{name}.png")
    top = [t for t, _, y in ui.ocr(f"ocr-{name}", w, h) if y < 130]
    chrome += [f"top text {t!r}" for t in top if "127.0.0.1" in t or "localhost" in t]
    if "innerHeight" not in BASE and s.get("innerHeight"):
        BASE["innerHeight"] = s["innerHeight"]
    with open("debug/standalone-state.jsonl", "a") as f:
        f.write(json.dumps({"shot": name, "state": s, "native": chrome}) + "\n")
    log(f"{name}: standalone={s.get('standalone')} displayMode={s.get('displayMode')} "
        f"innerHeight={s.get('innerHeight')} screen={s.get('screenH')} path={s.get('path')} "
        f"dockGap={s.get('dockGap')} ground={s.get('ground')} theme={s.get('theme')} "
        f"scrollY={s.get('scrollY')} chrome={chrome} topText={top[:6]}")
    if chrome or s.get("standalone") is False:
        msg = f"{name}: Safari chrome (native/top text {chrome}, standalone={s.get('standalone')}, innerHeight {s.get('innerHeight')})"
        PROBLEMS.append(msg)
        print(f"::error title=Safari chrome in the installed app::{msg}", flush=True)
        ui.save_debug(f"chrome-{name}", els)
    if BASE.get("innerHeight") and s.get("innerHeight") and s["innerHeight"] < BASE["innerHeight"] - 4:
        msg = (f"{name}: the viewport shrank to {s['innerHeight']} of {BASE['innerHeight']} px "
               f"(the bottom {BASE['innerHeight'] - s['innerHeight']} px of the display are outside the page)")
        PROBLEMS.append(msg)
        print(f"::error title=Viewport shrank in the installed app::{msg}", flush=True)
    # the edge must be the page's own ground (html's background), which a
    # page whose paper reaches the top switches to that paper
    ground = []
    m = re.match(r"rgba?\((\d+),\s*(\d+),\s*(\d+)", s.get("ground") or "")
    if m:
        ground = ["#%02x%02x%02x" % tuple(int(v) for v in m.groups())]
    r = sh("python3", os.path.join(HERE, "edges.py"), path, theme, *ground)
    for line in r.stdout.splitlines():
        if line.startswith("EDGE"):
            log("  " + line)
    bands = [ln for ln in r.stdout.splitlines() if ln.startswith("EDGE BAND")]
    if r.returncode == 1 and (s.get("scrollY") or 0) > 4 and all(": top " in ln for ln in bands):
        # scrolled: the page's own content runs under the status bar (budget
        # mode, phone-ground.css); only paint layers must stop short of it
        log("  top edge is scrolled content, not a layer: not a band")
    elif r.returncode == 1 and s.get("sheet") and all(": bottom " in ln for ln in bands):
        # an open sheet covers the screen to its bottom edge, as on iOS; the
        # scrim above it and the top edge stay in the paint budget
        log("  bottom edge is the open sheet, which covers the screen: not a band")
    elif r.returncode == 1:
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
    let r = el.getBoundingClientRect();
    if (r.width > 4 && (r.bottom > innerHeight || r.top < 0)) {{
      el.scrollIntoView({{block: 'center'}});
      r = el.getBoundingClientRect();
    }}
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

# Where the app is installed from. iOS 26 copies Safari's cookies into the new
# web app, so the signed-in tab gives a signed-in app; when it does not, the
# signed-out /today would be redirected by the middleware to the public origin
# (not 127.0.0.1 on the runner), so the Web Clip fallback starts at sign-in.
START = "/today"


def openurl(path):
    for _ in range(4):
        if sh("xcrun", "simctl", "openurl", UDID, HOST + path, timeout=60).returncode == 0:
            break
        time.sleep(10)
    time.sleep(20)


def install():
    sh("xcrun", "simctl", "ui", UDID, "appearance", "light")
    openurl(START)
    # what iOS can read for the install: the name and display mode come from
    # the manifest / apple-mobile-web-app-* tags when it sees them, else the
    # icon is named after <title> and opens as a plain web clip
    log("install: the page Safari adds: " + json.dumps(js("""
const q = (s) => document.querySelector(s);
const where = (el) => el ? (el.closest('head') ? 'head' : 'body') : null;
return {title: document.title, readyState: document.readyState,
        manifest: where(q('link[rel="manifest"]')),
        appleTitle: (q('meta[name="apple-mobile-web-app-title"]') || {}).content || null,
        appleTitleIn: where(q('meta[name="apple-mobile-web-app-title"]')),
        capable: where(q('meta[name="apple-mobile-web-app-capable"]')),
        statusBar: (q('meta[name="apple-mobile-web-app-status-bar-style"]') || {}).content || null};
""", "safari")))
    w, h = ui.screen()
    method, name = None, NAME
    got = ui.add_to_home_screen(w, h)
    if got:
        name = got if isinstance(got, str) else NAME
        log(f"install: Add to Home Screen made an icon named {name!r}")
        if name.strip().lower() != NAME.lower():
            msg = (f"the Add to Home Screen sheet named the app {name!r}, not {NAME!r}: "
                   "iOS did not read apple-mobile-web-app-title")
            log("PROBLEM: " + msg)
            print(f"::error title=Install name::{msg}", flush=True)
            with open("debug/standalone-problems.txt", "a") as f:
                f.write(msg + "\n")
        if ui.launch_icon(name, w, h):
            method = "share-sheet"
    if not method:
        ui.install_webclip(NAME, HOST + "/auth/signin?callbackUrl=%2Ftoday", "public/icons/apple-touch-icon.png")
        if ui.launch_icon(NAME, w, h):
            method = "webclip"
    time.sleep(10)
    where = js("return {href: location.href, displayMode: matchMedia('(display-mode: standalone)').matches,"
               " standalone: navigator.standalone, innerHeight, screenH: screen.height}", "webapp", None)
    log(f"install: method={method} front={ui.front_app()} app={json.dumps(where)}")
    if where and not where.get("displayMode"):
        msg = (f"the installed app is not in display-mode standalone (named {name!r}, innerHeight "
               f"{where.get('innerHeight')} of {where.get('screenH')}): iOS made a plain web clip")
        log("PROBLEM: " + msg)
        print(f"::error title=Installed without the manifest::{msg}", flush=True)
        with open("debug/standalone-problems.txt", "a") as f:
            f.write(msg + "\n")
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
    for _ in range(5):
        if rect(['input[type="email"]', 'input[name="email"]']):
            painted_form = True
            break
        time.sleep(3)
    if not painted_form:
        where = js("return location.href", "webapp", None)
        log(f"signin: no form found through Web Inspector (the app is at {where!r})")
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
        log("  viewport: " + json.dumps(js(VIEWPORT_JS)))
        ui.idb("ui", "swipe", "201", "542", "201", "140", "--duration", "0.5", check=False)
        time.sleep(2)
        check(f"standalone-{theme}-02-today-scrolled", theme)
        go("/tasks")
        check(f"standalone-{theme}-03-tasks-top", theme)
        for _ in range(3):
            ui.idb("ui", "swipe", "201", "542", "201", "140", "--duration", "0.5", check=False)
            time.sleep(0.5)
        # a fast swipe on a row can land as a tap; the rest of the way by script
        js("window.scrollTo(0, document.documentElement.scrollHeight); return 1")
        time.sleep(2)
        check(f"standalone-{theme}-04-tasks-bottom", theme)
        go("/settings#appearance")
        check(f"standalone-{theme}-05-settings-sheet", theme)
        log("  viewport: " + json.dumps(js(VIEWPORT_JS)))
        time.sleep(4)
        log("  viewport 4 s later: " + json.dumps(js(VIEWPORT_JS)))
        # pull-down, shot while the finger is still down
        go("/today")
        p = subprocess.Popen(["idb", "ui", "swipe", "201", "140", "201", "520", "--duration", "4", "--udid", UDID],
                             stdin=subprocess.DEVNULL, start_new_session=True)
        time.sleep(2.5)
        sh("xcrun", "simctl", "io", UDID, "screenshot", f"shots/standalone-{theme}-06-pull-down.png", timeout=60)
        try:
            p.wait(timeout=60)
        except subprocess.TimeoutExpired:
            ui.stamp("pull-down swipe did not return; killing it")
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except OSError:
                pass
        r = sh("python3", os.path.join(HERE, "edges.py"), f"shots/standalone-{theme}-06-pull-down.png", theme)
        log(f"standalone-{theme}-06-pull-down (finger down, no page state):")
        for line in r.stdout.splitlines():
            if line.startswith("EDGE"):
                log("  " + line)
        if r.returncode == 1:
            PROBLEMS.append(f"standalone-{theme}-06-pull-down: edge band")
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
    # Settings is the profile row at the end of the menu's list
    tap_sel(['[data-nva-tile="settings"]', '[data-nva-row="settings"]', '[data-nva-row="profile"]'], "settings")
    time.sleep(3)
    prev = check("standalone-nav-4-settings", "light", prev)
    log("  viewport: " + json.dumps(js(VIEWPORT_JS)))
    # back: the app's own back / close control, as a person would
    if not tap_sel(['[aria-label="Back"]', '[aria-label^="Back"]', '[aria-label="Close"]',
                    '[aria-label^="Close"]'], "back"):
        js("history.back(); return 1")
    time.sleep(3)
    prev = check("standalone-nav-5-back", "light", prev)
    js("history.back(); return 1")
    time.sleep(3)
    painted()
    check("standalone-nav-6-history-back", "light", prev)
    finish()


def finish():
    if PROBLEMS:
        log("PROBLEMS: " + "; ".join(PROBLEMS))
        with open("debug/standalone-problems.txt", "a") as f:
            f.write("\n".join(PROBLEMS) + "\n")
    else:
        log("no edge band, no Safari chrome")


# Seconds each command may take, a little under its step's timeout-minutes in
# safari-phone.yml: the script ends itself, with a log line and a problem for
# the verdict, instead of being killed by the runner without a word.
BUDGET = {"install": 780, "signin": 1080, "nav": 780, "scenarios": 1620}


def out_of_time(cmd):
    def handler(signum, frame):
        msg = f"standalone.py {cmd} used its {BUDGET[cmd]} s budget and was stopped"
        log("PROBLEM: " + msg)
        print(f"::error title=Installed app probe stalled::{msg}", flush=True)
        with open("debug/standalone-problems.txt", "a") as f:
            f.write(msg + "\n")
        os._exit(3)
    return handler


if __name__ == "__main__":
    os.makedirs("shots", exist_ok=True)
    os.makedirs("debug", exist_ok=True)
    cmd, args = sys.argv[1], sys.argv[2:]
    signal.signal(signal.SIGALRM, out_of_time(cmd))
    signal.alarm(BUDGET[cmd])
    ui.stamp("standalone.py", cmd, "starts, budget", BUDGET[cmd], "s")
    {"install": lambda: install(), "signin": lambda: signin(*args),
     "scenarios": lambda: scenarios(), "nav": lambda: nav()}[cmd]()
