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

echo "-- symbols that need a Required Reason declaration"
# Our own sources use none (see README) and every manifest declares none. This
# reads the undefined (imported) symbols of each linked binary, so a new
# dependency that starts using UserDefaults, file timestamps, boot time, disk
# space or active keyboards fails here instead of in App Store Connect.
# Substring match on purpose: real symbols look like _OBJC_CLASS_$_NSUserDefaults,
# _mach_absolute_time or $s10Foundation12UserDefaultsC...
TMP="${RUNNER_TEMP:-$(mktemp -d)}"
PATTERN='NSUserDefaults|UserDefaults|mach_absolute_time|systemUptime|NSFileCreationDate|NSFileModificationDate|NSURLContentModificationDateKey|NSURLCreationDateKey|NSURLContentAccessDateKey|getattrlist|fgetattrlist|getattrlistbulk|NSFileSystemFreeSize|NSFileSystemSize|NSURLVolumeAvailableCapacity|NSURLVolumeTotalCapacity|volumeAvailableCapacity|volumeTotalCapacity|statfs|statvfs|activeInputModes|_stat$|_fstat$|_lstat$|_fstatat$'
FOUND=0
BINARIES=("$APP/App" "$WIDGETS/NeedtWidgets" "$SHARE/NeedtShare")
for fw in "$APP"/Frameworks/*.framework; do
  [ -d "$fw" ] && BINARIES+=("$fw/$(basename "$fw" .framework)")
done
for bin in "${BINARIES[@]}"; do
  [ -f "$bin" ] || fail "binary missing: $bin"
  nm -u "$bin" > "$TMP/needt-nm.txt" 2>/dev/null || fail "nm could not read $bin"
  hits="$(grep -E "$PATTERN" "$TMP/needt-nm.txt" || true)"
  if [ -n "$hits" ]; then
    echo "::error::$(basename "$bin") imports Required Reason symbols that no manifest declares:"
    echo "$hits"
    FOUND=1
  else
    echo "$(basename "$bin"): no Required Reason symbols"
  fi
done
[ "$FOUND" = "0" ] || fail "declare the API in NSPrivacyAccessedAPITypes (with its reason code) or remove the use"

echo "-- archive"
ls "$ARCHIVE/dSYMs" 2>/dev/null || echo "no dSYMs folder"
plutil -p "$ARCHIVE/Info.plist" | head -20
echo "archive verified"
