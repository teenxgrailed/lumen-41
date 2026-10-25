#!/usr/bin/env python3
"""Safari's tab-bar layout (iOS 26: Compact / Bottom / Top) for the phone probe.
  layout.py serve BOOT_JS     viewport.html + the app's boot script on 127.0.0.1:8000;
                              the page POSTs its numbers to debug/viewport.jsonl
  layout.py set NAME          Settings > Apps > Safari > Tabs > NAME (compact|bottom|top)
  layout.py mark TEXT         a marker line in the log
  layout.py summary           the log, one line per distinct state
  layout.py verdict           data-safari-bar per layout must be the expected one
Settings is native, so idb's accessibility dump sees its rows."""
import json, os, subprocess, sys, time
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
LOG = "debug/viewport.jsonl"
EXPECT = {"compact": "bottom", "bottom": "bottom", "top": "top"}


def append(obj):
    os.makedirs("debug", exist_ok=True)
    with open(LOG, "a") as f:
        f.write(json.dumps(obj) + "\n")


def serve(boot_js):
    files = {"/boot.js": (boot_js, "text/javascript")}

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            path, kind = files.get(self.path, (os.path.join(HERE, "viewport.html"), "text/html; charset=utf-8"))
            body = open(path, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            try:
                append({"recv": time.time(), **json.loads(raw)})
            except Exception:
                pass
            self.send_response(204)
            self.end_headers()

        def log_message(self, *a):
            pass

    HTTPServer(("127.0.0.1", 8000), H).serve_forever()


def run(*c):
    # killed with its process group after 60 s, returncode 124; never raises, never hangs
    import ui
    return ui.hard_run(c, timeout=60)


def say(*a):
    import ui
    ui.stamp(*a)


def dump(tag, els):
    os.makedirs("debug", exist_ok=True)
    with open(f"debug/{tag}.json", "w") as f:
        json.dump(els, f, indent=1)
    run("xcrun", "simctl", "io", os.environ["UDID"], "screenshot", f"debug/{tag}.png")
    say(tag, [e.get("AXLabel") for e in els if e.get("AXLabel")][:60])


def lab(x):
    return (x.get("AXLabel") or "").strip().lower()


def set_layout(name):
    import ui
    udid = os.environ["UDID"]
    want = {"compact": ["compact"], "bottom": ["bottom", "tab bar"], "top": ["top", "single tab"]}[name]
    # Driving Settings is a walk of idb calls on a slow simulator: it gets a time
    # budget, and gives up (layout NOT set, the readings tagged -unset) past it
    deadline = time.time() + int(os.environ.get("LAYOUT_SET_BUDGET", "420"))

    def out_of_time():
        if time.time() > deadline:
            say(f"set {name}: out of time budget")
            return True
        return False

    def find_scroll(pred, tag, swipes):
        for i in range(swipes):
            if out_of_time():
                return None
            say(f"set {name}: looking for {tag}, pass {i + 1}/{swipes}")
            els = ui.describe()
            hit = next((x for x in els if pred(x) and 90 < x["frame"]["y"] < 780), None)
            if hit:
                return hit
            ui.swipe(200, 640, 200, 330, 0.5)
            time.sleep(2)
        dump(f"layout-{name}-{tag}-miss", ui.describe())
        return None

    def open_row(pred, tag, swipes):
        # a touch can be swallowed (the first one after a launch often is):
        # tap again while the row is still on screen
        for attempt in range(3):
            if out_of_time():
                return False
            row = find_scroll(pred, tag, swipes)
            if not row:
                return False
            ui.tap(*ui.centre(row))
            time.sleep(5)
            if not any(pred(x) for x in ui.describe()):
                return True
        dump(f"layout-{name}-{tag}-stuck", ui.describe())
        return False

    def options():
        return any(lab(x) in ("compact", "bottom", "top") for x in ui.describe())

    def selected():
        return any(lab(x) in want and "Selected" in (x.get("traits") or []) for x in ui.describe())

    say(f"set {name}: start, budget", os.environ.get("LAYOUT_SET_BUDGET", "420"), "s")
    run("xcrun", "simctl", "terminate", udid, "com.apple.mobilesafari")
    run("xcrun", "simctl", "terminate", udid, "com.apple.Preferences")
    time.sleep(2)
    run("xcrun", "simctl", "launch", udid, "com.apple.Preferences")
    time.sleep(8)
    # Settings may come back on the Safari page it was left on
    if not options():
        if not open_row(lambda x: x.get("AXUniqueId") == "com.apple.settings.apps", "apps", 12):
            return False
        if not open_row(lambda x: lab(x) == "safari" and x.get("type") not in ("Application", "Heading"), "safari", 25):
            return False
    for attempt in range(3):
        if out_of_time():
            return False
        hit = find_scroll(lambda x: lab(x) in want, "option", 14)
        if not hit:
            return False
        ui.tap(*ui.centre(hit))
        time.sleep(3)
        if selected():
            break
    ok = selected()
    dump(f"layout-{name}", ui.describe())
    run("xcrun", "simctl", "terminate", udid, "com.apple.Preferences")
    return ok


KEYS = ("bar", "displayMode", "innerH", "screenH", "lvh", "svh", "sab", "fixedBottom")


def rows():
    for line in open(LOG):
        yield json.loads(line)


def summary():
    last = None
    for o in rows():
        if "mark" in o:
            print(f"\n## {o['mark']}")
            last = None
            continue
        key = tuple(json.dumps(o.get(k)) for k in KEYS)
        if key == last:
            continue
        last = key
        print(f"[{o.get('layout')}] {o.get('why'):<15} scrollY={o.get('scrollY'):<5} " +
              " ".join(f"{k}={o.get(k)}" for k in KEYS))


def verdict():
    seen = {}
    for o in rows():
        if "mark" in o or o.get("layout") not in EXPECT:
            continue
        seen.setdefault(o["layout"], set()).add(o.get("bar"))
    bad = []
    for layout, want in EXPECT.items():
        got = seen.get(layout)
        print(f"{layout}: data-safari-bar {sorted(map(str, got or []))} (want {want})")
        if got is None:
            # Settings could not be driven: nothing was measured in this layout
            print(f"::warning title=Safari tab layout::{layout}: not measured (the layout could not be set)")
        elif got != {want}:
            bad.append(f"{layout}: data-safari-bar was {sorted(map(str, got or []))}, want {want}")
    for b in bad:
        print(f"::error title=Safari tab layout::{b}", flush=True)
    return not bad


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "set":
        # backstop under the budget: SIGALRM ends the process even inside a blocking call
        import signal

        def _stop(signum, frame):
            print("layout set: hard stop, the layout was NOT set", flush=True)
            os._exit(124)
        signal.signal(signal.SIGALRM, _stop)
        signal.alarm(int(os.environ.get("LAYOUT_SET_BUDGET", "420")) + 120)
    if cmd == "serve":
        serve(sys.argv[2])
    elif cmd == "set":
        ok = set_layout(sys.argv[2])
        print("layout", sys.argv[2], "set" if ok else "NOT set", flush=True)
        sys.exit(0 if ok else 1)
    elif cmd == "mark":
        append({"mark": " ".join(sys.argv[2:]), "recv": time.time()})
    elif cmd == "summary":
        summary()
    elif cmd == "verdict":
        sys.exit(0 if verdict() else 1)
