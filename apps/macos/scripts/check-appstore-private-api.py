#!/usr/bin/env python3
"""Fail if a source compiled into NeedtAppStore uses a private interface, starts
a subprocess or edits system state.

The compiled set is what project.yml says: Needt/Sources, Share/Sources,
Island/AppStore and Island/Sources minus the NeedtAppStore excludes. Lines that
`#if !APPSTORE` leaves out of the store build are skipped (see
appstore_sources.active_lines), and so are comment lines (the stand-ins explain
what they replace). Run from apps/macos.

Two groups of patterns:
  - private or restricted interfaces (SkyLight, DisplayServices, IOReport, ...)
  - what a sandboxed store app must not do: run Process()/NSTask, call system
    binaries (/usr/bin, /usr/sbin, killall), or touch the wallpaper store.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import appstore_sources as src  # noqa: E402

PRIVATE = [
    r"\bdlopen\b", r"\bdlsym\b", r"PrivateFrameworks", r"SkyLight", r"MediaRemote",
    r"mediaremote", r"DisplayServices", r"CoreBrightness", r"IOReport", r"AppleSMC",
    r"@_silgen_name", r"NSClassFromString", r"NSSelectorFromString",
    r"\bAXIsProcessTrusted", r"\bAXUIElement", r"CGEvent\.tapCreate", r"CGEventTapCreate",
    r"CABackdropLayer", r"internalSystemName", r"objc_getClass", r"IOHIDEventSystem",
    r"\bSLS[A-Z]\w+", r"\bCGS(?!Session)[A-Z]\w+",
]
SUBPROCESS_AND_SYSTEM = [
    r"\bProcess\(", r"\bNSTask\b", r"\bposix_spawn", r"\bpopen\(", r"(?<![.\w])(?<!func )system\(",
    r"/usr/bin", r"/usr/sbin", r"/bin/(sh|bash|zsh)\b", r"\bkillall\b",
    r"com\.apple\.wallpaper",
]
pattern = re.compile("|".join(PRIVATE + SUBPROCESS_AND_SYSTEM))

if len(src.store_excludes()) < 20:
    print("could not read the NeedtAppStore excludes from project.yml")
    sys.exit(2)

files = src.app_sources()
for base in ("Share/Sources",):
    files += sorted(src.walk(base))

bad = 0
for path in sorted(files):
    for number, line in src.active_lines(path):
        if line.lstrip().startswith("//"):
            continue
        match = pattern.search(line)
        if match:
            print(f"{path}:{number}: {match.group(0)}: {line.strip()[:120]}")
            bad += 1
print(f"{len(files)} files checked, {bad} hits (private interface, subprocess or system state)")
sys.exit(1 if bad else 0)
