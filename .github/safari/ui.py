#!/usr/bin/env python3
"""Tiny idb helper for the Safari phone probe. Usage: ui.py <cmd> [args]
Everything here drives the Simulator through the UI, like a person would."""
import json, os, subprocess, sys, time

UDID = os.environ["UDID"]


def idb(*args, check=True):
    return subprocess.run(["idb", *args, "--udid", UDID], capture_output=True, text=True, check=check)


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
            swipe(w / 2, h * 0.75, w / 2, h * 0.25, 0.25)
            time.sleep(0.5)
    elif cmd == "pull":  # pull down from the header, args: fraction of height
        swipe(w / 2, h * 0.14, w / 2, h * (0.14 + float(args[0])), 0.6)
    elif cmd == "tap":
        tap_el(args)
    elif cmd == "key":
        idb("ui", "key", args[0])
    elif cmd == "signin":
        email, password = args
        # the form is the first screen: email field sits at ~44% of the height
        tap(w / 2, h * 0.44)
        time.sleep(1)
        idb("ui", "text", email)
        time.sleep(1)
        idb("ui", "key", "43")  # Tab to the password field
        time.sleep(1)
        idb("ui", "text", password)
        time.sleep(1)
        idb("ui", "key", "40")  # Return submits the form
