#!/usr/bin/env python3
"""Tiny idb helper for the Safari phone probe. Usage: ui.py <cmd> [args]
Everything here drives the Simulator through the UI, like a person would."""
import json, os, subprocess, sys, time

UDID = os.environ["UDID"]


def idb(*args, check=True):
    print("idb", *args, flush=True)
    try:
        return subprocess.run(["idb", *args, "--udid", UDID], capture_output=True, text=True, check=check, timeout=150)
    except subprocess.TimeoutExpired:
        print("idb timed out", flush=True)
        return subprocess.CompletedProcess(args, 124, "", "timeout")


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
    subprocess.run(["xcrun", "simctl", "io", UDID, "screenshot", f"debug/{tag}.png"], capture_output=True, timeout=150)
    print(tag, "labels:", sorted({label(e) for e in els if label(e)})[:80], flush=True)


def add_to_home_screen(w, h):
    """Safari: Share > Add to Home Screen > (Open as Web App on) > Add, by labels.
    The iOS 26 compact bar hides Share behind the More (...) button."""
    tapped = {}
    for step in range(16):
        els = describe()
        save_debug(f"a2hs-{step:02d}", els)
        text = " ".join(haystack(e) for e in els)

        def exact(*names):
            for e in els:
                if label(e) in names and tapped.get(label(e), 0) < 3:
                    return e
            return None
        add = next((e for e in els if label(e) == "add" and e.get("enabled", True)), None)
        if add and ("home screen" in text or "web app" in text):
            for e in els:  # the iOS 26 sheet's "Open as Web App" switch must be on
                if "web app" in label(e) and str(e.get("AXValue")) in ("0", "off"):
                    tap(*centre(e))
                    time.sleep(2)
            tap(*centre(add))
            time.sleep(6)
            save_debug("a2hs-added", describe())
            return True
        e = (exact("add to home screen") or exact("share") or
             exact("more", "page menu", "more options", "show more", "view more", "tab options"))
        if e:
            tapped[label(e)] = tapped.get(label(e), 0) + 1
            tap(*centre(e))
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
        swipe(w * 0.85, h * 0.5, w * 0.15, h * 0.5, 0.3)
        time.sleep(2)
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
    r = subprocess.run(["xcrun", "simctl", "spawn", UDID, "launchctl", "stop", "com.apple.SpringBoard"],
                       capture_output=True, text=True, timeout=60)
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
        shot = lambda n: subprocess.run(["xcrun", "simctl", "io", UDID, "screenshot", f"shots/signin-{n}.png"], capture_output=True, timeout=150)
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
