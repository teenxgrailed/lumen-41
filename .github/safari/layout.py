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
    return subprocess.run(list(c), capture_output=True, text=True, timeout=120)


def dump(tag, els):
    os.makedirs("debug", exist_ok=True)
    with open(f"debug/{tag}.json", "w") as f:
        json.dump(els, f, indent=1)
    run("xcrun", "simctl", "io", os.environ["UDID"], "screenshot", f"debug/{tag}.png")
    print(tag, [e.get("AXLabel") for e in els if e.get("AXLabel")][:60], flush=True)


def lab(x):
    return (x.get("AXLabel") or "").strip().lower()


def set_layout(name):
    import ui
    udid = os.environ["UDID"]
    want = {"compact": ["compact"], "bottom": ["bottom", "tab bar"], "top": ["top", "single tab"]}[name]

    def find_scroll(pred, tag, swipes):
        for i in range(swipes):
            els = ui.describe()
            hit = next((x for x in els if pred(x) and 90 < x["frame"]["y"] < 780), None)
            if hit:
                return hit
            ui.swipe(200, 640, 200, 330, 0.5)
            time.sleep(2)
        dump(f"layout-{name}-{tag}-miss", ui.describe())
        return None

    run("xcrun", "simctl", "terminate", udid, "com.apple.mobilesafari")
    run("xcrun", "simctl", "terminate", udid, "com.apple.Preferences")
    time.sleep(2)
    run("xcrun", "simctl", "launch", udid, "com.apple.Preferences")
    time.sleep(8)
    # Settings may come back on the Safari page it was left on
    if not any(lab(x) in ("compact", "bottom", "top") for x in ui.describe()):
        apps = find_scroll(lambda x: x.get("AXUniqueId") == "com.apple.settings.apps" or lab(x) == "apps", "apps", 12)
        if not apps:
            return False
        ui.tap(*ui.centre(apps))
        time.sleep(5)
        saf = find_scroll(lambda x: lab(x) == "safari" and x.get("type") != "Application", "safari", 25)
        if not saf:
            return False
        ui.tap(*ui.centre(saf))
        time.sleep(5)
    hit = find_scroll(lambda x: lab(x) in want, "option", 14)
    if not hit:
        return False
    ui.tap(*ui.centre(hit))
    time.sleep(3)
    dump(f"layout-{name}", ui.describe())
    run("xcrun", "simctl", "terminate", udid, "com.apple.Preferences")
    return True


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
        key = tuple(json.dumps(o.get(k)) for k in KEYS + ("scrollY",))
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
        if got != {want}:
            bad.append(f"{layout}: data-safari-bar was {sorted(map(str, got or []))}, want {want}")
    for b in bad:
        print(f"::error title=Safari tab layout::{b}", flush=True)
    return not bad


if __name__ == "__main__":
    cmd = sys.argv[1]
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
