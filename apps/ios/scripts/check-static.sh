#!/bin/bash
# Static store-readiness checks on the files in the repo (no build needed):
# every plist lints, entitlements are the minimal set, the primary and alternate
# app icons have no alpha channel, the launch screen exists, the export options
# have the keys xcodebuild reads. Run from apps/ios.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "::error::$*"; exit 1; }
plist() { /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || true; }

APP=ios/App/App
WID=ios/App/NeedtWidgets
SHR=ios/App/NeedtShare

echo "-- plutil -lint"
plutil -lint \
  "$APP/Info.plist" "$APP/App.entitlements" "$APP/PrivacyInfo.xcprivacy" \
  "$WID/Info.plist" "$WID/NeedtWidgets.entitlements" "$WID/PrivacyInfo.xcprivacy" \
  "$SHR/Info.plist" "$SHR/NeedtShare.entitlements" "$SHR/PrivacyInfo.xcprivacy" \
  ExportOptions-AppStore.plist ios/App/App.xcodeproj/project.pbxproj

echo "-- privacy manifests"
for f in "$APP/PrivacyInfo.xcprivacy" "$WID/PrivacyInfo.xcprivacy" "$SHR/PrivacyInfo.xcprivacy"; do
  [ "$(plist "$f" NSPrivacyTracking)" = "false" ] || fail "$f: NSPrivacyTracking must be false"
  [ "$(plutil -extract NSPrivacyTrackingDomains xml1 -o - "$f" | grep -c '<string>')" = "0" ] || fail "$f: tracking domains must be empty"
  # Purposes are App Functionality only: no advertising, no analytics.
  if grep -q "Advertising\|PurposeAnalytics\|PurposeThirdParty" "$f"; then fail "$f: only AppFunctionality purposes are allowed"; fi
done

echo "-- entitlements"
# App Group on every target. Push (aps-environment) only on the app: the
# extensions never register. "development" here; App Store signing writes
# "production" into the signed binary. Sign in with Apple is a web flow
# (ASWebAuthenticationSession), so no com.apple.developer.applesignin.
for f in "$APP/App.entitlements" "$WID/NeedtWidgets.entitlements" "$SHR/NeedtShare.entitlements"; do
  [ "$(plist "$f" com.apple.security.application-groups:0)" = "group.app.needt.ios" ] || fail "$f: app group missing"
  if grep -q "applesignin" "$f"; then fail "$f: unexpected entitlement"; fi
  if [ "$f" != "$APP/App.entitlements" ] && grep -q "aps-environment" "$f"; then fail "$f: push belongs to the app only"; fi
done
[ "$(plist "$APP/App.entitlements" aps-environment)" = "development" ] || fail "App.entitlements: aps-environment must be development"
echo "entitlements: app group everywhere, push on the app only"

echo "-- Info.plist"
[ "$(plist "$APP/Info.plist" ITSAppUsesNonExemptEncryption)" = "false" ] || fail "ITSAppUsesNonExemptEncryption must be false"
[ "$(plist "$APP/Info.plist" UIRequiredDeviceCapabilities:0)" = "arm64" ] || fail "UIRequiredDeviceCapabilities must be arm64"
for k in NSCameraUsageDescription NSMicrophoneUsageDescription NSPhotoLibraryAddUsageDescription NSSpeechRecognitionUsageDescription; do
  [ -n "$(plist "$APP/Info.plist" "$k")" ] || fail "$k missing"
done
[ -f "$APP/Base.lproj/LaunchScreen.storyboard" ] || fail "LaunchScreen.storyboard missing"
[ "$(plist "$APP/Info.plist" UILaunchStoryboardName)" = "LaunchScreen" ] || fail "UILaunchStoryboardName must be LaunchScreen"

echo "-- app icons have no alpha"
ICONS="$APP/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
for icon in $ICONS $APP/Assets.xcassets/AppIcon-*.appiconset/*.png; do
  [ "$(sips -g pixelWidth "$icon" | awk '/pixelWidth/ {print $2}')" = "1024" ] || fail "$icon is not 1024 px wide"
  [ "$(sips -g hasAlpha "$icon" | awk '/hasAlpha/ {print $2}')" = "no" ] || fail "$icon has an alpha channel (App Store rejects it)"
done
# The iOS 18 dark and tinted variants of the primary icon are allowed to be
# transparent; only the 1024 marketing icon and the alternates must be opaque.

echo "-- export options"
[ "$(plist ExportOptions-AppStore.plist method)" = "app-store-connect" ] || fail "export method"
[ "$(plist ExportOptions-AppStore.plist signingStyle)" = "automatic" ] || fail "export signingStyle"
[ -n "$(plist ExportOptions-AppStore.plist teamID)" ] || fail "export teamID empty"
[ "$(plist ExportOptions-AppStore.plist uploadSymbols)" = "true" ] || fail "export uploadSymbols"
[ "$(plist ExportOptions-AppStore.plist destination)" = "export" ] || fail "export destination"

echo "static checks passed"
