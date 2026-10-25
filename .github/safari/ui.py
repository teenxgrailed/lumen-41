#!/usr/bin/env python3
"""Tiny idb helper for the Safari phone probe. Usage: ui.py <cmd> [args]
Everything here drives the Simulator through the UI, like a person would."""
import json, os, signal, subprocess, sys, time

UDID = os.environ["UDID"]
# One call that blocks (a hung idb gRPC, a simctl that never returns) must not
# hold the step: every external command here is killed, with its whole process
# group, after this many seconds.
CALL_TIMEOUT = int(os.environ.get("PROBE_CALL_TIMEOUT", "90"))
_T0 = time.time()


def stamp(*a):
    """A flushed log line with the wall clock and seconds since this process started."""
    print(f"[{time.strftime('%H:%M:%S')} +{time.time() - _T0:.0f}s]", *a, flush=True)


def hard_run(cmd, timeout=None, check=False):
    """subprocess.run that cannot hang: new process group, SIGKILL for the whole
    group on a timeout (capture_output + a grandchild holding the pipe would make
    run()'s own timeout wait forever). A timeout is returncode 124, never raised."""
    timeout = timeout or CALL_TIMEOUT
    cmd = list(cmd)
    p = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         text=True, start_new_session=True)
    try:
        out, err = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except OSError:
            pass
        try:
            out, err = p.communicate(timeout=5)
        except Exception:
            out, err = "", ""
        stamp("TIMEOUT after", timeout, "s:", " ".join(cmd)[:160])
        return subprocess.CompletedProcess(cmd, 124, out or "", "timeout")
    if check and p.returncode:
        raise subprocess.CalledProcessError(p.returncode, cmd, out, err)
    return subprocess.CompletedProcess(cmd, p.returncode, out, err)


def simctl(*args, timeout=60):
    return hard_run(["xcrun", "simctl", *args], timeout=timeout)


def screenshot(path, timeout=30):
    return simctl("io", UDID, "screenshot", path, timeout=timeout)


def idb(*args, check=True):
    stamp("idb", *args)
    return hard_run(["idb", *args, "--udid", UDID], check=check)


def describe():
    out = idb("ui", "describe-all", check=False).stdout
    try:
        data = json.loads(out)
    except Exception:
        data = []
    return data if isinstance(data, list) else [data]


def screen():
    for e in describe():
        if e.get("type") == "Application" or e.get("role") == "AXApplication":
            f = e["frame"]
            return f["width"], f["height"]
    return 402.0, 874.0


def centre(e):
    f = e["frame"]
    return f["x"] + f["width"] / 2, f["y"] + f["height"] / 2


def haystack(e):
    keys = ("AXLabel", "AXValue", "AXUniqueId", "title", "help", "role_description")
    return " ".join(str(e.get(k) or "") for k in keys).lower()


def find(words, types=None):
    for e in describe():
        if types and e.get("type") not in types:
            continue
        h = haystack(e)
        if any(w.lower() in h for w in words):
            return e
    return None


def tap(x, y):
    idb("ui", "tap", str(int(x)), str(int(y)))


def tap_el(words, types=None, tries=10):
    for _ in range(tries):
        e = find(words, types)
        if e:
            tap(*centre(e))
            return True
        time.sleep(2)
    return False


def swipe(x1, y1, x2, y2, duration=0.3):
    idb("ui", "swipe", str(int(x1)), str(int(y1)), str(int(x2)), str(int(y2)), "--duration", str(duration))


def type_slowly(text):
    # short chunks with a pause: bulk typing drops characters when the simulator lags
    for i in range(0, len(text), 3):
        idb("ui", "text", text[i:i + 3], check=False)
        time.sleep(1.5)


def label(e):
    return (e.get("AXLabel") or "").strip().lower()


def save_debug(tag, els):
    os.makedirs("debug", exist_ok=True)
    with open(f"debug/{tag}.json", "w") as f:
        json.dump(els, f, indent=1)
    screenshot(f"debug/{tag}.png")
    print(tag, "labels:", sorted({label(e) for e in els if label(e)})[:80], flush=True)


OCR_BIN = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "probe-ocr")


def ocr(tag, w, h):
    """Text on debug/<tag>.png (Vision), as (lowercase text, x, y) in points."""
    if not os.path.exists(OCR_BIN):
        src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr.swift")
        hard_run(["swiftc", "-O", src, "-o", OCR_BIN], timeout=600)
    try:
        r = hard_run([OCR_BIN, f"debug/{tag}.png"], timeout=120)
        items = json.loads(r.stdout)
    except Exception as e:
        print("ocr failed:", e, flush=True)
        return []
    words = [(i["text"].strip().lower(), i["x"] * w, i["y"] * h) for i in items]
    print(tag, "ocr:", [t for t, _, _ in words][:60], flush=True)
    return words


STOCK = {"calendar", "health", "maps", "messages", "news", "photos", "reminders", "safari", "search",
         "settings", "wallet", "contacts", "files", "fitness", "preview", "utilities folder", "watch",
         "app store", "camera", "clock", "home screen", "dock", "page 1 of 2", "page 2 of 2"}


def add_to_home_screen(w, h):
    """Safari: More (...) > Share > View More > Add to Home Screen > Add.
    Safari's own bar and menu are in idb's accessibility dump; the share sheet
    is a remote view that is not, so its rows are found by their text (OCR)."""
    tapped = {}

    def once(key, limit=3):
        tapped[key] = tapped.get(key, 0) + 1
        return tapped[key] <= limit

    for step in range(18):
        els = describe()
        tag = f"a2hs-{step:02d}"
        save_debug(tag, els)
        labels = {label(e) for e in els}
        words = ocr(tag, w, h)

        def word(pred):
            return next(((x, y) for t, x, y in words if pred(t)), None)

        def el(name):
            return next((e for e in els if label(e) == name), None)

        add = el("add")
        add_xy = centre(add) if add else word(lambda t: t == "add")
        if add_xy and once("add", 2):
            for e in els:  # the iOS 26 sheet's "Open as Web App" switch must be on
                if "web app" in label(e) and str(e.get("AXValue")) in ("0", "off"):
                    tap(*centre(e))
                    time.sleep(2)
            tap(*add_xy)
            time.sleep(8)
            els = describe()
            save_debug("a2hs-added", els)
            # iOS lands on the Home Screen page with the new icon: its name is
            # the label no stock app has
            new = sorted({label(e) for e in els if e.get("type") != "Application"} - STOCK - {""})
            print("new icon(s):", new, flush=True)
            return new[0] if new else True
        if any("view bookmarks, share menu" in l for l in labels) and once("tip"):
            # a one-time Safari tip bubble over the bar swallows the next tap
            x = el("close") or el("dismiss popup")
            tap(*centre(x))
            time.sleep(3)
            continue
        target = word(lambda t: t.startswith("add to home") or t == "add to home screen")
        if target and once("a2hs"):
            tap(*target)
        elif (target := word(lambda t: t == "view more")) and once("view more"):
            tap(*target)
        elif el("share") and once("share"):
            tap(*centre(el("share")))
        elif el("more") and once("more"):
            tap(*centre(el("more")))
        else:
            # the action list of the share sheet: scroll it up
            swipe(w / 2, h * 0.85, w / 2, h * 0.45, 0.4)
        time.sleep(4)
    return False


def home():
    idb("ui", "button", "HOME", check=False)
    time.sleep(3)


def find_icon(name):
    for e in describe():
        if name.lower() in label(e) and e.get("type") != "Application":
            return e
    return None


def launch_icon(name, w, h):
    """Home Screen, find the icon by its label (swipe through the pages), tap it."""
    home()
    home()  # a second press lands on the first page
    for page in range(5):
        e = find_icon(name)
        if e:
            print("icon", json.dumps(e)[:400], flush=True)
            tap(*centre(e))
            time.sleep(8)
            return True
        save_debug(f"home-{page}", describe())
        if page == 1:
            break
        swipe(w * 0.85, h * 0.5, w * 0.15, h * 0.5, 0.3)
        time.sleep(2)
    # SpringBoard often gives idb no elements: read the icon names from the
    # screen, then Spotlight
    home()
    home()
    save_debug("home-ocr", [])
    hit = next(((x, y) for t, x, y in ocr("home-ocr", w, h) if t == name.lower()), None)
    if hit:
        tap(hit[0], hit[1] - 40)  # the icon sits above its name
        time.sleep(10)
        if front_app() not in (None, "", "Springboard", "SpringBoard"):
            return True
    for attempt in range(3):
        home()
        home()
        tap(w / 2, h * 0.82)  # the Search pill above the dock
        time.sleep(5)
        type_slowly(name)
        time.sleep(5)
        save_debug(f"spotlight-{attempt}", describe())
        idb("ui", "key", "40")  # Return opens the top hit
        time.sleep(10)
        app = front_app()
        print("front app after Spotlight:", app, flush=True)
        if app and app.lower() not in ("springboard", "spotlight", "safari", "search"):
            return True
    return False


def front_app():
    for e in describe():
        if e.get("type") == "Application":
            return e.get("AXLabel")
    return None


def install_webclip(title, url, icon):
    """The fallback: a FullScreen Web Clip written into the simulator's data
    folder (what a com.apple.webClip.managed profile leaves), then SpringBoard
    restarted so it reads the clips again."""
    import plistlib, shutil, uuid
    base = os.path.expanduser(f"~/Library/Developer/CoreSimulator/Devices/{UDID}/data/Library/WebClips")
    d = os.path.join(base, uuid.uuid4().hex.upper() + ".webclip")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "Info.plist"), "wb") as f:
        plistlib.dump({"Title": title, "URL": url, "FullScreen": True, "IsRemovable": True,
                       "IconIsPrecomposed": True, "IconIsScreenShotBased": False,
                       "WebClipStatusBarStyle": "UIStatusBarStyleBlackTranslucent",
                       "ClassicMode": False, "ContentMode": "Mobile"}, f)
    if icon and os.path.exists(icon):
        shutil.copy(icon, os.path.join(d, "icon.png"))
    print("webclip at", d, flush=True)
    r = simctl("spawn", UDID, "launchctl", "stop", "com.apple.SpringBoard")
    print("respring:", r.returncode, r.stdout, r.stderr, flush=True)
    time.sleep(20)


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "dump":
        print(json.dumps(describe(), indent=1))
        sys.exit(0)
    w, h = screen()
    if cmd == "size":
        print(w, h)
    elif cmd == "up":  # scroll the page up: finger moves up. args: count
        for _ in range(int(args[0]) if args else 1):
            swipe(w / 2, h * 0.62, w / 2, h * 0.16, 0.25)  # starts above the dock, which a swipe would grab
            time.sleep(0.5)
    elif cmd == "pull":  # pull down from the header, args: fraction of height
        swipe(w / 2, h * 0.14, w / 2, h * (0.14 + float(args[0])), 0.6)
    elif cmd == "tap":
        tap_el(args)
    elif cmd == "text":
        idb("ui", "text", args[0], check=False)
    elif cmd == "tapxy":
        tap(float(args[0]), float(args[1]))
    elif cmd == "a2hs":
        sys.exit(0 if add_to_home_screen(w, h) else 1)
    elif cmd == "launch":  # args: icon label
        sys.exit(0 if launch_icon(args[0], w, h) else 1)
    elif cmd == "webclip":  # args: title url [icon.png]
        install_webclip(args[0], args[1], args[2] if len(args) > 2 else None)
    elif cmd == "home":
        home()
    elif cmd == "front":
        print(front_app())
    elif cmd == "labels":  # args: tag
        save_debug(args[0] if args else "labels", describe())
    elif cmd == "back":  # the edge swipe from the left
        swipe(2, h * 0.5, w * 0.7, h * 0.5, 0.3)
    elif cmd == "key":
        idb("ui", "key", args[0])
    elif cmd == "signin":
        email, password = args
        shot = lambda n: screenshot(f"shots/signin-{n}.png")
        # web content is not exposed to accessibility: coordinates it is. The
        # simulator has no GPU on a runner, so wait after each event. The email
        # field is tapped, typed into, then the password field is tapped (Tab did
        # nothing); what the typing test showed to work.
        # a touch can be swallowed: tap twice, a second tap on a focused field is harmless
        tap(w / 2, h * 0.44)
        time.sleep(6)
        tap(w / 2, h * 0.44)
        time.sleep(8)
        type_slowly(email)
        time.sleep(8)
        shot("2-email")
        tap(w / 2, h * 0.54)
        time.sleep(8)
        tap(w / 2, h * 0.54)  # the first touch after the keyboard opened can be swallowed
        time.sleep(10)
        shot("2b-password-focus")
        type_slowly(password)
        time.sleep(8)
        shot("3-password")
        idb("ui", "key", "40")  # Return submits the form
