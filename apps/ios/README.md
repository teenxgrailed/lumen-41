# Needt for iOS

A Capacitor 8 shell around the web app. The app does not bundle the UI: the
WebView loads `https://use.needt.app` (`server.url` in `capacitor.config.json`),
so every web deploy reaches the iOS app at once. Navigation is limited to
`needt.app` hosts; anything else opens outside the app.

- App id `app.needt.ios`, name "Needt"
- Native project uses Swift Package Manager (no CocoaPods)
- Plugins: App, Haptics, Push Notifications, Share, Splash Screen, Status Bar
- Local plugins (`ios/App/App/NeedtPlugins.swift`, registered by `NeedtViewController` in `capacitorDidLoad`, the Capacitor 6+ way for plugins that live in the app target): `NeedtAppIcon` (`setIcon({ name })`, `getIcon()` over `setAlternateIconName`) and `NeedtAuth` (`start({ url, callbackScheme })`, an `ASWebAuthenticationSession`)
- `www/` is a placeholder Capacitor requires; it is never shown

## Run locally

Needs a Mac with Xcode 26 and Node 22.

```bash
cd apps/ios
npm ci
npx cap sync ios
npx cap open ios        # then Run on any Simulator, no signing needed
```

Or from the command line:

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
```

CI does the same on every push to `apps/ios/**`: `.github/workflows/ios-sim.yml`
builds, boots a Simulator, launches the app, and uploads the `.app` and a
screenshot as the `needt-ios-simulator` artifact. `.github/workflows/ios-archive.yml`
archives the Release build (see Store readiness).

## Web side

`src/lib/native.ts` detects `window.Capacitor` and is a no-op in browsers. The
shell exposes plugins on `window.Capacitor.Plugins`, so the web bundle ships no
`@capacitor/*` code. Wired today: haptic on task complete, status bar style
follows the resolved theme. Available but not called yet: `share()`,
`registerNativePush()`.

## Widgets, Controls and the Live Activity

`ios/App/NeedtWidgets` is a WidgetKit extension (bundle id
`app.needt.ios.widgets`, iOS 17+). It is only an entry point: everything lives in
`apps/shared/NeedtWidgetKit` (views, widgets, intents, Live Activity) on top of
the data layer `apps/shared/NeedtKit` (snapshot, models, timelines, cache).

- Widgets: Today (S/M/L, iPad XL, Lock Screen), Next event, Focus timer, Habits,
  Quick add; Controls: Add task, Start focus; Live Activity: focus.
- Eight styles (A Sky, B Pixel, C Bento, E Lucky cat, F Noir, G Mist, H Rim,
  D Ink) chosen in each widget's Edit menu; D Ink is the default and is the
  layout tinted, clear and Lock Screen fall back to.
- Data comes from the existing routes (`/api/tasks`, `/api/events`,
  `/api/habits`, `/api/habits/history`, `/api/focus/session`, `/api/billing`)
  with the web view's session. The app copies the `needt.app` cookies into the
  shared vault (`WidgetBridge`) and clears them on sign-out.
- App Group `group.app.needt.ios` (App.entitlements, NeedtWidgets.entitlements)
  holds the cache, the vault file and the pending link. Unsigned builds fall back
  to a private folder, so the widgets then show "Sign in".
- `needt://open?path=/today` (also `/focus`, `/habits`, `/calendar`,
  `/quick-add`, `/tasks`) opens that screen in the web view; the Quick add
  Control opens `/quick-add` through a pending link.
- "Show titles on Lock Screen" is off by default: a widget parameter in the Edit
  menu and a Shortcuts action for the Live Activity.
- CI (`ios-sim.yml`) builds the App scheme, which builds and embeds the
  extension, and checks the `.appex` is inside; `widgets.yml` renders every
  style and state to PNG (artifact `needt-widget-snapshots`).

## Waiting for the Apple Developer account

| Item                      | Why it waits                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signing and a real device | Needs a team id and a development certificate                                                                                                                                               |
| Push (APNs)               | Needs the Push Notifications capability and an APNs key; add `aps-environment` entitlement, send the device token to the server, deliver from the worker. Web push stays as it is meanwhile |
| TestFlight / App Store    | Needs App Store Connect record, distribution signing, privacy answers and review notes                                                                                                      |
| Bundle id registration    | `app.needt.ios`, `app.needt.ios.widgets` and `app.needt.ios.share` must be registered, each with the App Groups capability and `group.app.needt.ios`                                        |
| Sign in with Apple        | Required by App Review if other social logins are offered                                                                                                                                   |

## Store readiness

What is in the repo so the owner only adds a Team ID, signs, uploads and submits.
`ios-archive.yml` (macOS runner, no signing) archives the Release build on every
push to `apps/ios/**` or `apps/shared/**`, checks the archive, and keeps it as the
`needt-ios-archive` artifact.

- **Privacy manifests.** `PrivacyInfo.xcprivacy` in the app, `NeedtWidgets` and `NeedtShare`: no tracking, no tracking domains, collected data as in the privacy notice (name, email, user id, user content, photos, mail, support, purchases, crash data), all App Functionality
- **Required Reason APIs.** None used. Not in the app, NeedtKit or NeedtWidgetKit sources (no `UserDefaults`, file timestamps, boot time, disk space, active keyboards). Capacitor 8.5.3 stores its keys in files and ships an empty manifest. `verify-archive.sh` lists the symbols the linked binaries reference, so a new dependency that starts using one shows up in CI
- **Encryption.** `ITSAppUsesNonExemptEncryption = false`: only HTTPS through the system and the keychain; no CryptoKit or custom crypto in the app
- **Device.** `UIRequiredDeviceCapabilities = arm64`; minimum iOS 17.0 (was 15; the widgets were already 17, and App Shortcuts need it)
- **Usage strings.** Camera (Take Photo in the file picker), microphone and speech (dictation in text fields), Photos add (Save Image)
- **Entitlements.** App Group only, on all three targets. No `aps-environment`: push is not wired (`AppDelegate` does not forward the device token and nothing calls `registerNativePush`). No `applesignin`: sign-in is the web flow in `ASWebAuthenticationSession`. Add each with its capability when the feature is built
- **Icon, launch.** 1024 px icon and all 12 alternates have no alpha (checked by `scripts/check-static.sh`); `LaunchScreen.storyboard` exists
- **4.2, not just a website.** Native offline screen, App Shortcuts (add task, start focus, what is today), Share extension (link or text becomes a task), widgets, Controls, Live Activity, alternate icons, haptics

The three bundle ids to register, each with the App Groups capability and
`group.app.needt.ios`: `app.needt.ios`, `app.needt.ios.widgets`,
`app.needt.ios.share`. Sign in with Apple and Push stay off until built.

### Native pieces added for review

- Offline screen (`OfflineScreen.swift`): `NeedtViewController` wraps the web view's
  navigation delegate; when the main page fails with a network error (offline,
  host unreachable, timeout, TLS) a SwiftUI screen covers the web view with the
  last Today list from the widgets' cache (read-only, only while a session
  exists), a Try again button, and an automatic retry when `NWPathMonitor`
  reports a usable path. A cancelled load or a redirect never shows it.
- App Shortcuts (`NeedtShortcuts.swift`): Add task, Start focus, What is today.
  They call the API with the vault session and do not open the app. The widget
  intents in `NeedtWidgetKit` are not reused: linking that package would put
  every widget view in the app binary.
- Share extension (`ios/App/NeedtShare`, bundle id `app.needt.ios.share`): a
  shared link or text becomes a task through NeedtKit. Same behaviour as
  `apps/macos/Share`.

### What the owner does

1. developer.apple.com: register the three App IDs above and the App Group, then
   create the app in App Store Connect (bundle id `app.needt.ios`).
2. Put the Team ID in `ExportOptions-AppStore.plist` (`YOUR_TEAM_ID`).
3. Archive and export (needs the Mac signed in to the Apple Developer account):

   ```bash
   cd apps/ios && npm ci && npx cap sync ios
   TEAM=ABCDE12345   # your Team ID
   xcodebuild archive -project ios/App/App.xcodeproj -scheme App -configuration Release \
     -destination 'generic/platform=iOS' -archivePath build/Needt.xcarchive \
     DEVELOPMENT_TEAM=$TEAM -allowProvisioningUpdates
   xcodebuild -exportArchive -archivePath build/Needt.xcarchive -exportPath build/export \
     -exportOptionsPlist ExportOptions-AppStore.plist -allowProvisioningUpdates
   ```

   Or Product > Archive in Xcode with the team set on the three targets.
4. Upload `build/export/App.ipa` with Transporter (or Xcode Organizer), fill the
   App Store Connect privacy answers from the table above, add review notes and a
   reviewer login (see `docs/operations`), submit.

### What CI proves, and what it cannot

- Proven on every run: the Release build archives; the archive holds `App.app` with
  `NeedtWidgets.appex` and `NeedtShare.appex`, a valid `PrivacyInfo.xcprivacy` in
  all three, the Info.plist keys above, 12 alternate icons, the compiled launch
  screen and the App Shortcuts metadata; plists lint; icons have no alpha.
- `xcodebuild -exportArchive` cannot succeed in CI: it needs an Apple Distribution
  certificate and profiles. CI runs it anyway and asserts (`scripts/check-export-log.sh`)
  that it fails on signing and not on `ExportOptions-AppStore.plist`. That shows the
  options file is read by the real tool; it does not show your certificates work.
- Not proven: signing, the entitlements actually embedded in a signed build, how the
  offline screen, shortcuts and Share sheet behave on a device, App Store Connect's
  own validation (it may still ask about a Required Reason API in a dependency).

## Icon, launch screen, sign-in

- `AppIcon` is the Midnight master (`needt-ios-1024.png`) with the iOS 18 dark
  (transparent) and tinted appearances. The other 12 are `AppIcon-<id>` sets
  listed in `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`; the web picker
  calls `NeedtAppIcon.setIcon` (free: midnight, ink, sky, paper).
- `LaunchScreen.storyboard`: `LaunchGround` colour (light #F6F6F3, dark
  #0C0B16) and the `LaunchMark` at 100 pt centred. The SplashScreen plugin
  shows that same storyboard for 600 ms and fades it, so there is one splash.
- Sign-in screen (`src/components/needt3/auth/IosSignIn.tsx`) shows only in the
  app: Apple, Google, email. Apple and Google run in the system sheet and come
  back through the one-time-code handoff (see
  `docs/operations/sign-in-providers.md`). The `needt://` return is caught by
  the sheet itself (`callbackURLScheme`), so no URL scheme is registered in
  Info.plist; add `CFBundleURLTypes` only if a link must open the app from
  outside the sheet.
- Sign in with Apple needs the Apple Developer account and the Apple provider
  keys (`APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
  or System Settings → Sign-in providers). Until then the button is drawn and
  says it is not set up yet when pressed (hiding it would break the Apple
  first order the design and App Review want).

## App icon (alternate icons)

Midnight is the primary `AppIcon`. The other twelve are alternate icon sets
(`AppIcon-<id>.appiconset`, generated from the design pack's 1024 px PNGs,
flattened because iOS rejects alpha) listed in
`ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`. The web app calls
`window.Capacitor.Plugins.NeedtAppIcon.setIcon({ name })` (`setNativeAppIcon`
in `src/lib/native.ts`; `name` is `null` for Midnight) and is silent when the
plugin is missing.

The Swift plugin `NeedtAppIcon` (`NeedtPlugins.swift`, wraps
`UIApplication.shared.setAlternateIconName`) is written and registered by
`NeedtViewController`. //todo: confirm on a Simulator or device that the icon
switches (the system shows its own confirmation alert); CI only builds.
