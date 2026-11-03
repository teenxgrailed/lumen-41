#!/usr/bin/env python3
"""Check the privacy manifests of the Mac App Store build against its sources.

  1. Each manifest (Privacy/AppStore, Privacy/Share, Privacy/Widgets) parses,
     says NSPrivacyTracking false, uses only values Apple documents, and the app
     manifest lists collected data.
  2. Every Required Reason API category the compiled sources use is declared in
     the manifest of the target that compiles them. The app is scanned over
     Needt/Sources, Island/AppStore and the Island/Sources that project.yml does
     not exclude for NeedtAppStore (lines left out by `#if !APPSTORE` do not
     count); the extensions over their own sources and the shared packages.
  3. `--packages DIR` prints the same scan over the resolved Swift packages
     (SourcePackages/checkouts). Information only: a package declares its own
     Required Reason APIs in its own manifest.
  4. `--list FILE` writes the Island sources compiled into NeedtAppStore.

Run from apps/macos. Exit 1 when a check fails.
"""
import argparse
import os
import plistlib
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import appstore_sources as src  # noqa: E402

CATEGORIES = {
    "NSPrivacyAccessedAPICategoryUserDefaults": {
        "reasons": {"CA92.1", "1C8F.1", "C56D.1", "AC6B.1"},
        "pattern": r"\bUserDefaults\b|@AppStorage|@Default\(|\bDefaults\[|\bDefaults\.(Keys|Key<|publisher|observe)",
    },
    "NSPrivacyAccessedAPICategoryFileTimestamp": {
        "reasons": {"DDA9.1", "C617.1", "3B52.1", "0A2A.1"},
        # attributesOfItem(atPath:) alone is not a timestamp read (it also returns .size);
        # a timestamp read names the key (.creationDate, .modificationDate) as well.
        "pattern": r"\.creationDateKey|\.contentModificationDateKey|\.contentAccessDateKey|\.attributeModificationDateKey"
        r"|NSFileCreationDate|NSFileModificationDate|\bstat\(|\bfstat\(|\blstat\(|\bfstatat\("
        r"|getattrlist|FileAttributeKey\.(creationDate|modificationDate)|\[\.(creationDate|modificationDate)\]",
    },
    "NSPrivacyAccessedAPICategorySystemBootTime": {
        "reasons": {"35F9.1", "8FFB.1", "3D61.1"},
        "pattern": r"\bsystemUptime\b|\bmach_absolute_time\b|\bmach_continuous_time\b|\bclock_gettime(_nsec_np)?\b",
    },
    "NSPrivacyAccessedAPICategoryDiskSpace": {
        "reasons": {"E174.1", "85F4.1", "7D9E.1", "B728.1"},
        "pattern": r"volumeAvailableCapacity|volumeTotalCapacity|NSFileSystemFreeSize|NSFileSystemSize"
        r"|\bstatfs\(|\bstatvfs\(|attributesOfFileSystem|systemFreeSize",
    },
    "NSPrivacyAccessedAPICategoryActiveKeyboards": {
        "reasons": {"3EC4.1", "54BD.1"},
        "pattern": r"\bactiveInputModes\b",
    },
}

DATA_TYPES = {
    "Name", "EmailAddress", "PhoneNumber", "PhysicalAddress", "OtherUserContactInfo", "Health", "Fitness",
    "PaymentInfo", "CreditInfo", "OtherFinancialInfo", "PreciseLocation", "CoarseLocation", "SensitiveInfo",
    "Contacts", "EmailsOrTextMessages", "PhotosorVideos", "AudioData", "GameplayContent", "CustomerSupport",
    "OtherUserContent", "BrowsingHistory", "SearchHistory", "UserID", "DeviceID", "PurchaseHistory",
    "ProductInteraction", "AdvertisingData", "OtherUsageData", "CrashData", "PerformanceData",
    "OtherDiagnosticData", "EnvironmentScanning", "Hands", "Head", "OtherDataTypes",
}
PURPOSES = {
    "ThirdPartyAdvertising", "DeveloperAdvertising", "Analytics", "ProductPersonalization",
    "AppFunctionality", "Other",
}

failed = False


def fail(message):
    global failed
    failed = True
    print("FAIL:", message)


def load(path):
    with open(path, "rb") as handle:
        return plistlib.load(handle)


def check_manifest(path, expect_collected):
    manifest = load(path)
    if manifest.get("NSPrivacyTracking") is not False:
        fail(f"{path}: NSPrivacyTracking must be false")
    if manifest.get("NSPrivacyTrackingDomains") != []:
        fail(f"{path}: NSPrivacyTrackingDomains must be empty")
    collected = manifest.get("NSPrivacyCollectedDataTypes")
    if not isinstance(collected, list) or (expect_collected and not collected):
        fail(f"{path}: NSPrivacyCollectedDataTypes missing" if expect_collected else f"{path}: bad collected data list")
    seen = set()
    for entry in collected or []:
        kind = entry.get("NSPrivacyCollectedDataType", "")
        name = kind.replace("NSPrivacyCollectedDataType", "", 1)
        if not kind.startswith("NSPrivacyCollectedDataType") or name not in DATA_TYPES:
            fail(f"{path}: unknown data type {kind}")
        if kind in seen:
            fail(f"{path}: {kind} listed twice")
        seen.add(kind)
        if entry.get("NSPrivacyCollectedDataTypeTracking") is not False:
            fail(f"{path}: {kind} must not be used for tracking")
        if not isinstance(entry.get("NSPrivacyCollectedDataTypeLinked"), bool):
            fail(f"{path}: {kind} needs NSPrivacyCollectedDataTypeLinked")
        purposes = entry.get("NSPrivacyCollectedDataTypePurposes") or []
        if not purposes:
            fail(f"{path}: {kind} has no purpose")
        for purpose in purposes:
            if purpose.replace("NSPrivacyCollectedDataTypePurpose", "", 1) not in PURPOSES:
                fail(f"{path}: unknown purpose {purpose}")
    declared = {}
    for entry in manifest.get("NSPrivacyAccessedAPITypes") or []:
        category = entry.get("NSPrivacyAccessedAPIType")
        reasons = entry.get("NSPrivacyAccessedAPITypeReasons") or []
        if category not in CATEGORIES:
            fail(f"{path}: unknown API category {category}")
            continue
        if not reasons:
            fail(f"{path}: {category} has no reason")
        for reason in reasons:
            if reason not in CATEGORIES[category]["reasons"]:
                fail(f"{path}: {reason} is not a documented reason for {category}")
        declared[category] = reasons
    return declared


def scan(files, use_if=True):
    """{category: [(file, line, text)]} over the given files."""
    found = {}
    for path in files:
        lines = src.active_lines(path) if use_if else list(enumerate(open(path, errors="ignore"), 1))
        for number, text in lines:
            if text.lstrip().startswith("//"):
                continue
            for category, spec in CATEGORIES.items():
                if re.search(spec["pattern"], text):
                    found.setdefault(category, []).append((path, number, text.strip()[:110]))
    return found


def compare(label, files, declared):
    found = scan(files)
    print(f"== {label}: {len(files)} files")
    for category in CATEGORIES:
        hits = found.get(category, [])
        mark = "declared" if category in declared else "not declared"
        print(f"  {category.replace('NSPrivacyAccessedAPICategory', '')}: {len(hits)} use(s), {mark}")
        for path, number, text in hits[:3]:
            print(f"      {path}:{number}: {text}")
        if hits and category not in declared:
            fail(f"{label} uses {category} ({hits[0][0]}:{hits[0][1]}) but its manifest does not declare it")
        if not hits and category in declared:
            fail(f"{label} declares {category} but nothing compiled into it uses it")
    return found


parser = argparse.ArgumentParser()
parser.add_argument("--packages", help="SourcePackages/checkouts folder to scan (information only)")
parser.add_argument("--list", help="write the Island sources compiled into NeedtAppStore here")
args = parser.parse_args()

app_declared = check_manifest("Privacy/AppStore/PrivacyInfo.xcprivacy", expect_collected=True)
share_declared = check_manifest("Privacy/Share/PrivacyInfo.xcprivacy", expect_collected=False)
widgets_declared = check_manifest("Privacy/Widgets/PrivacyInfo.xcprivacy", expect_collected=False)

app_files = src.app_sources()
if len(src.store_excludes()) < 20 or len(app_files) < 200:
    fail("could not read the NeedtAppStore sources from project.yml")
compare("NeedtAppStore", app_files, app_declared)
compare("NeedtShare", src.extension_sources("Share/Sources"), share_declared)
compare("NeedtWidgets", src.extension_sources("Widgets/Sources"), widgets_declared)

if args.list:
    island = src.island_sources()
    with open(args.list, "w") as handle:
        handle.write(f"# Island sources compiled into NeedtAppStore: {len(island)} of "
                     f"{len(list(src.walk('Island/Sources')))} files (project.yml excludes the rest)\n")
        handle.write("# Island/AppStore/AppStoreStubs.swift stands in for the excluded private-API files.\n")
        handle.write("\n".join(island) + "\n")
    print(f"wrote {args.list}: {len(island)} Island files")

if args.packages and os.path.isdir(args.packages):
    print("== Swift packages (information only; each declares its own)")
    for package in sorted(os.listdir(args.packages)):
        base = os.path.join(args.packages, package)
        files = []
        for sub in ("Sources", "src"):
            if os.path.isdir(os.path.join(base, sub)):
                files += list(src.walk(os.path.join(base, sub)))
        found = scan(files, use_if=False)
        has_manifest = any(
            name == "PrivacyInfo.xcprivacy" for _, _, names in os.walk(base) for name in names
        )
        summary = ", ".join(
            f"{c.replace('NSPrivacyAccessedAPICategory', '')}={len(v)}" for c, v in found.items()
        ) or "none"
        print(f"  {package}: {summary}; own privacy manifest: {'yes' if has_manifest else 'no'}")

sys.exit(1 if failed else 0)
