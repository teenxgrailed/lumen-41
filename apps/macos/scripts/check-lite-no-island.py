#!/usr/bin/env python3
"""Prove that NeedtAppStoreLite holds nothing from apps/macos/Island.

The island is a fork of Atoll / boring.notch under GPL v3. The Lite build exists
so that the Mac App Store build can ship without any of it. Three checks, run
from apps/macos:

  --sources        before the build: project.yml's NeedtAppStoreLite target lists
                   no path under Island/ and none of the island's packages, the
                   files it compiles are all outside Island/, and the lines of
                   those files that the NO_ISLAND build compiles name no island
                   type or package.
  --derived DIR    after the build: the Swift file lists Xcode wrote for the
                   NeedtAppStoreLite target (derived data) name no file under
                   Island/. Fails when no list is found (a count of zero over
                   nothing proves nothing).
  --app PATH       the archived Needt.app: no Island licence or acknowledgements
                   file, none of the island's lottie/audio resources, no island
                   framework, and none of a list of distinctive island type
                   names in the binary. A name from Needt's own code must be
                   found in the same binary, so that an empty `strings` output
                   cannot pass.

Exit 1 when a check fails.
"""
import argparse
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import appstore_sources as src  # noqa: E402

# Names that exist only in Island/ (counted in the sources: each is declared there
# and nowhere in Needt/, Share/ or Widgets/). Types of the island's own, picked
# from its window, notch, media, shelf and Needt-module code.
ISLAND_NAMES = [
    "DynamicIslandViewCoordinator", "DynamicIslandViewModel", "IslandV3Controller",
    "IslandAppDelegate", "NotchSpaceManager", "WebcamManager", "MusicManager",
    "ShelfStateViewModel", "NeedtModule", "LottieUI",
]
# The packages only the island linked.
ISLAND_PACKAGES = ["Defaults", "KeyboardShortcuts", "LaunchAtLogin", "LottieUI", "SwiftUIIntrospect",
                   "Collections", "SwiftTerm", "Sparkle"]
# Present in Needt's own code: proves the binary scan reads symbols at all.
CONTROL_NAMES = ["StatusItemController", "TrayStore", "AppController", "QuickAddPanel", "FocusBridge",
                 "AuthFlow", "NeedtWebView", "MainWindowController"]

failed = False


def fail(message):
    global failed
    failed = True
    print("FAIL:", message)


def ok(message):
    print("ok:", message)


def check_sources():
    paths = src.lite_target_paths()
    print("NeedtAppStoreLite sources in project.yml:", paths)
    if not paths:
        fail("could not read the NeedtAppStoreLite sources from project.yml")
    for path in paths:
        if path.startswith("Island") or "/Island" in path:
            fail(f"project.yml: the Lite target lists {path}")
    text = open("project.yml").read()
    start = text.index("\n  NeedtAppStoreLite:\n    type: application")
    end = text.index("\n    entitlements:", start)
    for line in text[start:end].splitlines():
        match = re.match(r"\s*- package: (\w+)", line)
        if match and match.group(1) in ISLAND_PACKAGES:
            fail(f"project.yml: the Lite target links the package {match.group(1)}")
    if "-Bridging-Header" in text[start:text.index("\n  # \"Add to Needt\"", start)]:
        fail("project.yml: the Lite target sets a bridging header (the island's)")
    if "NO_ISLAND" not in text[start:]:
        fail("project.yml: the Lite target does not set NO_ISLAND")

    src.set_no_island(True)
    files = src.lite_sources()
    island_files = [f for f in files if f.replace("\\", "/").startswith("Island")]
    if island_files:
        fail(f"{len(island_files)} compiled files are under Island/")
    pattern = re.compile(
        r"\b(" + "|".join(ISLAND_NAMES + ["IslandEntitlement", "IslandSettingsPane", "IslandV3Render"]) + r")\b"
        r"|^\s*import\s+(" + "|".join(ISLAND_PACKAGES) + r")\b")
    bad = 0
    for path in files:
        for number, line in src.active_lines(path):
            if line.lstrip().startswith("//"):
                continue
            if pattern.search(line):
                print(f"{path}:{number}: {line.strip()[:120]}")
                bad += 1
    if bad:
        fail(f"{bad} lines compiled into the Lite build name an island type or package")
    if not failed:
        ok(f"{len(files)} files compiled, 0 under Island/, no island type or package named")


def check_derived(root):
    lists = []
    for dirpath, _, names in os.walk(root):
        if "NeedtAppStoreLite.build" not in dirpath:
            continue
        lists += [os.path.join(dirpath, n) for n in names if n.endswith(".SwiftFileList")]
    if not lists:
        fail(f"no *.SwiftFileList for NeedtAppStoreLite under {root}")
        return
    compiled = set()
    for path in lists:
        for line in open(path, errors="ignore"):
            line = line.strip()
            if line:
                compiled.add(line)
    island = sorted(f for f in compiled if "/apps/macos/Island/" in f or "/Island/Sources/" in f)
    print(f"Swift files compiled into NeedtAppStoreLite: {len(compiled)} (from {len(lists)} list(s))")
    print(f"Island files among them: {len(island)}")
    if len(compiled) < 20:
        fail("the Swift file list is implausibly short; the check read the wrong thing")
    if island:
        fail("Island files are compiled into NeedtAppStoreLite:\n  " + "\n  ".join(island[:20]))
    else:
        ok(f"0 Island files in {len(compiled)} compiled Swift files")


def check_app(app):
    resources = os.path.join(app, "Contents", "Resources")
    for name in ("LICENSE.txt", "ACKNOWLEDGEMENTS.md"):
        if os.path.exists(os.path.join(resources, name)):
            fail(f"{name} (the island's) is in the bundle")
    shipped = set()
    for dirpath, _, names in os.walk(app):
        shipped |= set(names)
    island_assets = set()
    for dirpath, _, names in os.walk("Island/LottieAnimations"):
        island_assets |= set(names)
    for sub in ("audio-feedback.m4a", "dynamic.m4a", "lock.mp3", "lowbattery.mp3"):
        island_assets.add(sub)
    leaked = sorted(island_assets & shipped)
    if leaked:
        fail(f"island resources in the bundle: {leaked[:10]}")
    frameworks = os.path.join(app, "Contents", "Frameworks")
    if os.path.isdir(frameworks):
        print("frameworks in the bundle:", sorted(os.listdir(frameworks)))
        for name in os.listdir(frameworks):
            if any(name.startswith(p) for p in ISLAND_PACKAGES):
                fail(f"an island package is embedded: {name}")
    binary = os.path.join(app, "Contents", "MacOS", "Needt")
    text = subprocess.run(["strings", binary], capture_output=True, text=True).stdout
    controls = [name for name in CONTROL_NAMES if name in text]
    print("control names found in the binary:", controls)
    if not controls:
        fail("none of Needt's own type names is in the binary: `strings` does not show type names, "
             "so the island names below prove nothing")
    found = [name for name in ISLAND_NAMES if name in text]
    for marker in ("boring.notch", "TheBoredTeam"):
        if marker in text:
            found.append(marker)
    if found:
        fail(f"island names in the binary: {found}")
    if not failed:
        ok(f"no island resource, framework or type name in the bundle "
           f"(checked {len(ISLAND_NAMES)} names, controls found: {controls})")


parser = argparse.ArgumentParser()
parser.add_argument("--sources", action="store_true")
parser.add_argument("--derived")
parser.add_argument("--app")
args = parser.parse_args()
if not (args.sources or args.derived or args.app):
    parser.error("give --sources, --derived DIR or --app PATH")
if args.sources:
    check_sources()
if args.derived:
    check_derived(args.derived)
if args.app:
    check_app(args.app)
sys.exit(1 if failed else 0)
