#!/usr/bin/env python3
"""Check the archived Mac App Store app (Needt.app inside the .xcarchive).

  python3 scripts/check-appstore-bundle.py <path to Needt.app> [Generated/NeedtAppStore.entitlements]

  - universal binaries (arm64 and x86_64) for the app and both extensions
  - the extensions are embedded, Sparkle is not
  - Info.plist: no updater keys, no local-networking exception, no usage string
    for a capability this build does not have, encryption declared exempt, a
    category, an icon; every usage string that needs an entitlement has it
  - the entitlements carry nothing that is not on the allow list, no temporary
    exception, and every one of them has the usage string (or is explained)
  - a privacy manifest in the app and in each extension, equal to the source
  - the icon file holds every macOS size (16 to 512 at 1x and 2x = 16 to 1024 px)

An archive built with CODE_SIGNING_ALLOWED=NO carries no signature, so the
entitlements are read from the file XcodeGen wrote, which is what Xcode signs
with.
"""
import filecmp
import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile

app = sys.argv[1]
ent_path = sys.argv[2] if len(sys.argv) > 2 else "Generated/NeedtAppStore.entitlements"
failed = False


def fail(message):
    global failed
    failed = True
    print("FAIL:", message)


def ok(message):
    print("ok:", message)


def load(path):
    with open(path, "rb") as handle:
        return plistlib.load(handle)


# --- binaries ---------------------------------------------------------------
binaries = {
    "Needt": f"{app}/Contents/MacOS/Needt",
    "NeedtShare": f"{app}/Contents/PlugIns/NeedtShare.appex/Contents/MacOS/NeedtShare",
    "NeedtWidgets": f"{app}/Contents/PlugIns/NeedtWidgets.appex/Contents/MacOS/NeedtWidgets",
}
for name, path in binaries.items():
    if not os.path.isfile(path):
        fail(f"{name}: no binary at {path}")
        continue
    archs = subprocess.run(["lipo", "-archs", path], capture_output=True, text=True).stdout.split()
    if {"arm64", "x86_64"} <= set(archs):
        ok(f"{name} is universal ({' '.join(archs)})")
    else:
        fail(f"{name} is not universal: {archs}")
if os.path.exists(f"{app}/Contents/Frameworks/Sparkle.framework"):
    fail("Sparkle.framework is inside the App Store build")

# --- Info.plist ------------------------------------------------------------
info = load(f"{app}/Contents/Info.plist")
for key in ("SUFeedURL", "SUPublicEDKey", "SUEnableAutomaticChecks", "NSAppTransportSecurity",
            "NSBluetoothAlwaysUsageDescription", "NSBluetoothPeripheralUsageDescription",
            "NSDesktopFolderUsageDescription", "NSDocumentsFolderUsageDescription",
            "NSDownloadsFolderUsageDescription", "NSScreenCaptureUsageDescription"):
    if key in info:
        fail(f"Info.plist has {key}")
if info.get("ITSAppUsesNonExemptEncryption") is not False:
    fail("ITSAppUsesNonExemptEncryption is not false")
if not info.get("LSApplicationCategoryType"):
    fail("LSApplicationCategoryType missing")
if not (info.get("CFBundleIconFile") or info.get("CFBundleIconName")):
    fail("no CFBundleIconFile / CFBundleIconName")
if info.get("CFBundleIdentifier") != "app.needt.mac":
    fail(f"bundle id is {info.get('CFBundleIdentifier')}")

# --- entitlements <-> usage strings -----------------------------------------
entitlements = load(ent_path)
ALLOWED = {
    "com.apple.security.app-sandbox",
    "com.apple.security.network.client",
    "com.apple.security.files.user-selected.read-only",
    "com.apple.security.files.bookmarks.app-scope",
    "com.apple.security.device.camera",
    "com.apple.security.device.audio-input",
    "com.apple.security.personal-information.calendars",
    "com.apple.security.personal-information.location",
    "com.apple.security.scripting-targets",
    "com.apple.security.application-groups",
}
for key in entitlements:
    if key not in ALLOWED:
        fail(f"entitlement {key} is not on the allow list (temporary exceptions are refused in review)")
if entitlements.get("com.apple.security.app-sandbox") is not True:
    fail("not sandboxed")

# entitlement -> the usage strings that must go with it (any one is enough)
NEEDS_STRING = {
    "com.apple.security.device.camera": ["NSCameraUsageDescription"],
    "com.apple.security.device.audio-input": ["NSMicrophoneUsageDescription"],
    "com.apple.security.personal-information.calendars": [
        "NSCalendarsFullAccessUsageDescription", "NSRemindersFullAccessUsageDescription"],
    "com.apple.security.personal-information.location": [
        "NSLocationWhenInUseUsageDescription", "NSLocationUsageDescription"],
    "com.apple.security.scripting-targets": ["NSAppleEventsUsageDescription"],
}
for entitlement, strings in NEEDS_STRING.items():
    if entitlement in entitlements:
        for string in strings:
            if not info.get(string):
                fail(f"{entitlement} without {string}")
# usage string -> the entitlement it needs; None = needs no entitlement
STRING_NEEDS = {
    "NSCameraUsageDescription": "com.apple.security.device.camera",
    "NSMicrophoneUsageDescription": "com.apple.security.device.audio-input",
    "NSCalendarsUsageDescription": "com.apple.security.personal-information.calendars",
    "NSCalendarsFullAccessUsageDescription": "com.apple.security.personal-information.calendars",
    "NSRemindersUsageDescription": "com.apple.security.personal-information.calendars",
    "NSRemindersFullAccessUsageDescription": "com.apple.security.personal-information.calendars",
    "NSLocationUsageDescription": "com.apple.security.personal-information.location",
    "NSLocationWhenInUseUsageDescription": "com.apple.security.personal-information.location",
    "NSAppleEventsUsageDescription": "com.apple.security.scripting-targets",
    "NSAudioCaptureUsageDescription": None,  # Core Audio tap: a Privacy setting, no entitlement
    "NSAppleMusicUsageDescription": None,  # MusicKit: App ID service, no entitlement
}
for key in info:
    if key.startswith("NS") and key.endswith("UsageDescription"):
        if key not in STRING_NEEDS:
            fail(f"{key} is not on the list of strings this build may carry")
        elif STRING_NEEDS[key] and STRING_NEEDS[key] not in entitlements:
            fail(f"{key} without {STRING_NEEDS[key]}")
        elif not str(info[key]).strip():
            fail(f"{key} is empty")
ok(f"{len(entitlements)} entitlements, "
   f"{sum(1 for k in info if k.endswith('UsageDescription'))} usage strings, all matched")

# --- privacy manifests ------------------------------------------------------
for bundle, source in (
    (f"{app}/Contents/Resources/PrivacyInfo.xcprivacy", "Privacy/AppStore/PrivacyInfo.xcprivacy"),
    (f"{app}/Contents/PlugIns/NeedtShare.appex/Contents/Resources/PrivacyInfo.xcprivacy",
     "Privacy/Share/PrivacyInfo.xcprivacy"),
    (f"{app}/Contents/PlugIns/NeedtWidgets.appex/Contents/Resources/PrivacyInfo.xcprivacy",
     "Privacy/Widgets/PrivacyInfo.xcprivacy"),
):
    if not os.path.isfile(bundle):
        fail(f"missing {bundle}")
    elif load(bundle) != load(source):
        fail(f"{bundle} differs from {source}")
    else:
        ok(f"{os.path.relpath(bundle, app)} present")

# --- icon -------------------------------------------------------------------
icon_name = (info.get("CFBundleIconFile") or "AppIcon")
icon = f"{app}/Contents/Resources/{icon_name}" + ("" if icon_name.endswith(".icns") else ".icns")
if not os.path.isfile(icon):
    fail(f"icon file {icon} missing")
elif shutil.which("iconutil"):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "AppIcon.iconset")
        result = subprocess.run(["iconutil", "--convert", "iconset", "--output", out, icon],
                                capture_output=True, text=True)
        # iconutil names the files by role and drops duplicates (16@2x and 32 are the
        # same pixels), so the check reads the pixel width of each PNG instead.
        widths = set()
        if result.returncode == 0:
            for name in sorted(os.listdir(out)):
                with open(os.path.join(out, name), "rb") as handle:
                    head = handle.read(24)
                if head[:8] == b"\x89PNG\r\n\x1a\n":
                    widths.add(int.from_bytes(head[16:20], "big"))
                    print("  icns entry:", name, int.from_bytes(head[16:20], "big"), "px")
        # actool keeps only the small sizes in the .icns and the rest in Assets.car,
        # so the compiled catalog is read too (App Store validation reads the catalog).
        car_widths = set()
        car = f"{app}/Contents/Resources/Assets.car"
        if os.path.isfile(car) and shutil.which("xcrun"):
            info_json = subprocess.run(["xcrun", "assetutil", "--info", car],
                                       capture_output=True, text=True).stdout
            try:
                for entry in json.loads(info_json):
                    if entry.get("Name") == "AppIcon" and entry.get("PixelWidth"):
                        car_widths.add(int(entry["PixelWidth"]))
                        print("  Assets.car AppIcon:", entry.get("PixelWidth"), "x", entry.get("PixelHeight"),
                              entry.get("Scale"), entry.get("Idiom"))
            except ValueError:
                print("  assetutil output not readable:", info_json[:200])
        # 16, 32, 128, 256, 512 at 1x and 2x need these pixel sizes
        want = {16, 32, 128, 256, 512, 1024}
        have_px = widths | car_widths
        if want <= have_px:
            ok(f"AppIcon holds every macOS size (icns {sorted(widths)}, Assets.car {sorted(car_widths)})")
        else:
            fail(f"AppIcon is missing pixel widths {sorted(want - have_px)} "
                 f"(icns {sorted(widths)}, Assets.car {sorted(car_widths)}) {result.stderr.strip()}")

# the source asset catalog: all ten macOS slots, each file the right pixel size
catalog = "Needt/Resources/Assets.xcassets/AppIcon.appiconset"
slots = json.load(open(f"{catalog}/Contents.json"))["images"]
have = {(i["size"], i["scale"]) for i in slots if i.get("idiom") == "mac" and i.get("filename")}
want_slots = {(f"{n}x{n}", f"{k}x") for n in (16, 32, 128, 256, 512) for k in (1, 2)}
if have != want_slots:
    fail(f"AppIcon.appiconset slots missing: {sorted(want_slots - have)}")
for i in slots:
    n, k = int(i["size"].split("x")[0]), int(i["scale"][0])
    with open(f"{catalog}/{i['filename']}", "rb") as handle:
        head = handle.read(24)
    if int.from_bytes(head[16:20], "big") != n * k:
        fail(f"{i['filename']} is not {n * k}px for {i['size']}@{i['scale']}")
ok("AppIcon.appiconset has all ten macOS slots at the right pixel sizes")

sys.exit(1 if failed else 0)
