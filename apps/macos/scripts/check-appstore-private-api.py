#!/usr/bin/env python3
"""Fail if a source compiled into NeedtAppStore uses a private interface.

The compiled set is what project.yml says: Needt/Sources, Share/Sources,
Island/AppStore and Island/Sources minus the NeedtAppStore excludes. Comment
lines are skipped (the stand-ins explain what they replace). Run from
apps/macos.
"""
import fnmatch
import os
import re
import sys

ROOT = os.getcwd()
FORBIDDEN = [
    r"\bdlopen\b", r"\bdlsym\b", r"PrivateFrameworks", r"SkyLight", r"MediaRemote",
    r"mediaremote", r"DisplayServices", r"CoreBrightness", r"IOReport", r"AppleSMC",
    r"@_silgen_name", r"NSClassFromString", r"NSSelectorFromString",
    r"\bAXIsProcessTrusted", r"\bAXUIElement", r"CGEvent\.tapCreate", r"CGEventTapCreate",
    r"CABackdropLayer", r"internalSystemName", r"objc_getClass", r"IOHIDEventSystem",
    r"\bSLS[A-Z]\w+", r"\bCGS(?!Session)[A-Z]\w+",
]
pattern = re.compile("|".join(FORBIDDEN))


def store_excludes():
    """The `excludes:` of the Island/Sources entry under NeedtAppStore."""
    text = open("project.yml").read()
    start = text.index("\n  NeedtAppStore:")
    end = text.index("\n  # \"Add to Needt\"", start)
    block = text[start:end]
    src = block.index("- path: Island/Sources")
    tail = block[src:]
    out = []
    in_ex = False
    for line in tail.splitlines()[1:]:
        stripped = line.strip()
        if stripped.startswith("excludes:"):
            in_ex = True
            continue
        if in_ex:
            if stripped.startswith("- path:"):
                break
            if stripped.startswith("- "):
                out.append(stripped[2:].strip().strip('"'))
    return out


def excluded(rel, patterns):
    for pat in patterns:
        if pat.endswith("/**"):
            if rel.startswith(pat[:-2]):
                return True
        elif fnmatch.fnmatch(rel, pat):
            return True
    return False


def swift_files(base, patterns=()):
    for dirpath, _, files in os.walk(base):
        for name in files:
            if not name.endswith((".swift", ".mm", ".m", ".h", ".cpp", ".hpp")):
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, base)
            if not excluded(rel, patterns):
                yield full


patterns = store_excludes()
if len(patterns) < 20:
    print("could not read the NeedtAppStore excludes from project.yml")
    sys.exit(2)

files = []
for base in ("Needt/Sources", "Share/Sources", "Island/AppStore"):
    files += list(swift_files(base))
files += list(swift_files("Island/Sources", patterns))

bad = 0
for path in sorted(files):
    with open(path, errors="ignore") as handle:
        for number, line in enumerate(handle, 1):
            if line.lstrip().startswith("//"):
                continue
            match = pattern.search(line)
            if match:
                print(f"{path}:{number}: {match.group(0)}: {line.strip()[:120]}")
                bad += 1
print(f"{len(files)} files checked, {bad} private-interface hits")
sys.exit(1 if bad else 0)
