#!/bin/bash
# Checks an unsigned .xcarchive of the iOS app is what the App Store expects to
# receive: the widget and share extensions are embedded, every bundle carries a
# privacy manifest, the Info.plist keys App Store Connect validates are there,
# and the App Shortcuts metadata was extracted.
# Usage: scripts/verify-archive.sh build/Needt.xcarchive
set -euo pipefail

ARCHIVE="${1:?path to the .xcarchive}"
APP="$ARCHIVE/Products/Applications/App.app"
WIDGETS="$APP/PlugIns/NeedtWidgets.appex"
SHARE="$APP/PlugIns/NeedtShare.appex"

fail() { echo "::error::$*"; exit 1; }
plist() { /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || true; }

[ -d "$APP" ] || fail "App.app is not in the archive ($APP)"
[ -d "$WIDGETS" ] || fail "NeedtWidgets.appex is not embedded"
[ -d "$SHARE" ] || fail "NeedtShare.appex is not embedded"

echo "-- bundle ids"
[ "$(plist "$APP/Info.plist" CFBundleIdentifier)" = "app.needt.ios" ] || fail "app bundle id"
[ "$(plist "$WIDGETS/Info.plist" CFBundleIdentifier)" = "app.needt.ios.widgets" ] || fail "widgets bundle id"
[ "$(plist "$SHARE/Info.plist" CFBundleIdentifier)" = "app.needt.ios.share" ] || fail "share bundle id"
[ "$(plist "$WIDGETS/Info.plist" NSExtension:NSExtensionPointIdentifier)" = "com.apple.widgetkit-extension" ] || fail "widgets extension point"
[ "$(plist "$SHARE/Info.plist" NSExtension:NSExtensionPointIdentifier)" = "com.apple.share-services" ] || fail "share extension point"

echo "-- privacy manifests"
for dir in "$APP" "$WIDGETS" "$SHARE"; do
  f="$dir/PrivacyInfo.xcprivacy"
  [ -f "$f" ] || fail "PrivacyInfo.xcprivacy missing in $dir"
  plutil -lint "$f" > /dev/null || fail "invalid manifest in $dir"
  [ "$(plist "$f" NSPrivacyTracking)" = "false" ] || fail "NSPrivacyTracking must be false in $dir"
  echo "$f: ok"
done

echo "-- Info.plist (app)"
INFO="$APP/Info.plist"
[ "$(plist "$INFO" ITSAppUsesNonExemptEncryption)" = "false" ] || fail "ITSAppUsesNonExemptEncryption"
[ "$(plist "$INFO" UIRequiredDeviceCapabilities:0)" = "arm64" ] || fail "UIRequiredDeviceCapabilities"
for k in NSCameraUsageDescription NSMicrophoneUsageDescription NSPhotoLibraryAddUsageDescription \
         NSSpeechRecognitionUsageDescription NSSupportsLiveActivities CFBundleShortVersionString \
         CFBundleVersion UILaunchStoryboardName MinimumOSVersion DTPlatformName; do
  v="$(plist "$INFO" "$k")"
  [ -n "$v" ] || fail "$k is missing from the built Info.plist"
  echo "$k = $v"
done
[ -d "$APP/Base.lproj/LaunchScreen.storyboardc" ] || fail "compiled LaunchScreen.storyboardc missing"
[ -f "$APP/Assets.car" ] || fail "Assets.car missing (no app icon)"
echo "primary icon name: $(plist "$INFO" CFBundleIcons:CFBundlePrimaryIcon:CFBundleIconName)"
ALT=$(plutil -extract CFBundleIcons.CFBundleAlternateIcons json -o - "$INFO" | python3 -I -c 'import json,sys; print(len(json.load(sys.stdin)))')
echo "alternate icons in Info.plist: $ALT"
[ "$ALT" -ge 12 ] || fail "expected 12 alternate icons, found $ALT"

echo "-- App Shortcuts metadata"
META="$APP/Metadata.appintents"
[ -d "$META" ] || fail "Metadata.appintents missing: App Shortcuts were not extracted"
for intent in AddTaskShortcutIntent StartFocusShortcutIntent TodayShortcutIntent; do
  grep -rq "$intent" "$META" || fail "$intent not found in $META"
done
echo "shortcut intents found in $META"

echo "-- symbols that need a Required Reason declaration (informational)"
# Our own sources use none (see README). This lists what the linked binaries
# reference, so a new dependency that starts using one shows up here.
for bin in "$APP/App" "$WIDGETS/NeedtWidgets" "$SHARE/NeedtShare"; do
  [ -f "$bin" ] || continue
  strings -a "$bin" > /tmp/needt-strings.txt
  for sym in NSUserDefaults UserDefaults mach_absolute_time systemUptime NSFileCreationDate \
             NSFileModificationDate NSURLContentModificationDateKey NSURLCreationDateKey getattrlist \
             fstat volumeAvailableCapacity systemFreeSize activeInputModes; do
    if grep -qw "$sym" /tmp/needt-strings.txt; then echo "$(basename "$bin"): references $sym"; fi
  done
done

echo "-- archive"
ls "$ARCHIVE/dSYMs" 2>/dev/null || echo "no dSYMs folder"
plutil -p "$ARCHIVE/Info.plist" | head -20
echo "archive verified"
