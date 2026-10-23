#!/usr/bin/env python3
"""Fails when a window-hosted SwiftUI root can push its size back into its window.

An NSHostingView / NSHostingController with the default sizing options feeds
its ideal size into the window's min/max size and intrinsic size on every
layout pass. A ticking countdown then loops inside "Update Constraints in
Window" until AppKit aborts the app. Every hosting view in apps/macos must have
`sizingOptions = []`, either by being created through `makeHostingView` /
`makeHostingController` (Island/Sources/helpers/HostingView.swift) or by
setting it itself within a few lines of the constructor.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HELPER = ROOT / "Island/Sources/helpers/HostingView.swift"
SETS = re.compile(r"sizingOptions\s*=\s*\[\s*\]")
CTOR = re.compile(r"(?<![\w.])(NSHostingView|NSHostingController|FirstMouseHostingView)\s*(<[^>]*>)?\s*\(")
SUBCLASS = re.compile(r"class\s+\w+(<[^>]*>)?\s*:\s*NSHosting(View|Controller)\b")
SCENE = re.compile(r"NSHostingSceneRepresentation|NSHostingMenu")
# A SwiftUI scene owns a window whose hosting view publishes its size (the
# crash this guard exists for). The menu-bar item, Settings and every window
# are AppKit; there is no SwiftUI App at all.
SWIFTUI_SCENE = re.compile(r"(?<![\w.])(MenuBarExtra|WindowGroup|DocumentGroup|Window|UtilityWindow)\s*[({<]|(?<![\w.])Settings\s*\{|:\s*App\b|some\s+Scene\b")

failed = []
sources = [p for p in ROOT.rglob("*.swift") if "Generated" not in p.parts and "build" not in p.parts]

helper_text = HELPER.read_text() if HELPER.exists() else ""
if len(SETS.findall(helper_text)) < 2:
    failed.append(f"{HELPER}: makeHostingView and makeHostingController must set sizingOptions = []")

for path in sources:
    if path == HELPER:
        continue
    lines = path.read_text().splitlines()
    text = "\n".join(lines)
    rel = path.relative_to(ROOT)
    if SUBCLASS.search(text) and not SETS.search(text):
        failed.append(f"{rel}: a hosting view subclass must set sizingOptions = [] in its init")
    for i, line in enumerate(lines):
        code = line.split("//")[0]
        if SWIFTUI_SCENE.search(code):
            failed.append(f"{rel}:{i + 1}: SwiftUI scene ({line.strip()}); use NSStatusItem / an AppKit window with makeHostingView")
        if SCENE.search(code):
            failed.append(f"{rel}:{i + 1}: audit this scene-hosted window by hand, then extend this check")
        if SUBCLASS.search(code):
            continue
        if CTOR.search(code):
            window = "\n".join(lines[i : i + 25])
            if not SETS.search(window):
                failed.append(f"{rel}:{i + 1}: {line.strip()}  -> use makeHostingView(rootView:) or set sizingOptions = []")

if failed:
    print("Hosting view sizing guard failed:")
    print("\n".join(failed))
    sys.exit(1)
print(f"ok: {len(sources)} Swift files checked")
