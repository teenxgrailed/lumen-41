# Needt for iOS

A Capacitor 8 shell around the web app. The app does not bundle the UI: the
WebView loads `https://use.needt.app` (`server.url` in `capacitor.config.json`),
so every web deploy reaches the iOS app at once. Navigation is limited to
`needt.app` hosts; anything else opens outside the app.

- App id `app.needt.ios`, name "Needt"
- Native project uses Swift Package Manager (no CocoaPods)
- Plugins: App, Haptics, Push Notifications, Share, Splash Screen, Status Bar
- Local plugins (`ios/App/App/NeedtPlugins.swift`, registered by `NeedtViewController` in `capacitorDidLoad`, the Capacitor 6+ way for plugins that live in the app target): `NeedtAppIcon` (`setIcon({ name })`, `getIcon()` over `setAlternateIconName`), `NeedtAuth` (`start({ url, callbackScheme })`, an `ASWebAuthenticationSession`) and `NeedtStore` (StoreKit 2, see "In-app purchase")
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
follows the resolved theme, notifications through APNs (Settings,
Notifications; `NativePushHost` opens a tapped notification's path and saves
the token again at start). Available but not called yet: `share()`.

## Widgets, Controls and the Live Activity

`ios/App/NeedtWidgets` is a WidgetKit extension (bundle id
`app.needt.ios.widgets`, iOS 18+). It is only an entry point: everything lives in
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

| Item                      | Why it waits                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signing and a real device | Needs a team id and a development certificate                                                                                                                      |
| TestFlight / App Store    | Needs App Store Connect record, distribution signing, privacy answers and review notes                                                                             |
| Bundle id registration    | `app.needt.ios`, `app.needt.ios.widgets` and `app.needt.ios.share` must be registered, each with the App Groups capability and `group.app.needt.ios`               |
| Sign in with Apple        | No entitlement needed (web flow). The Apple provider must be configured in production before submission: App Review 4.8 and 2.1 (see Icon, launch screen, sign-in) |

## Store readiness

What is in the repo so the owner only adds a Team ID, signs, uploads and submits.
`ios-archive.yml` (macOS runner, no signing) archives the Release build on every
push to `apps/ios/**` or `apps/shared/**`, checks the archive, and keeps it as the
`needt-ios-archive` artifact.

- **Privacy manifests.** `PrivacyInfo.xcprivacy` in the app, `NeedtWidgets` and `NeedtShare`: no tracking, no tracking domains, collected data as in the privacy notice (name, email, user id, user content, photos, mail, support, purchases, bug-report diagnostics as Other Diagnostic Data, crash data), all App Functionality
- **Required Reason APIs.** None used. Not in the app, NeedtKit or NeedtWidgetKit sources (no `UserDefaults`, file timestamps, boot time, disk space, active keyboards). Capacitor 8.5.3 stores its keys in files and ships an empty manifest. `verify-archive.sh` reads the imported symbols (`nm -u`) of the app, both extensions and the embedded frameworks and fails on any Required Reason symbol, so a new dependency that starts using one breaks CI
- **Encryption.** `ITSAppUsesNonExemptEncryption = false`: only HTTPS through the system; the session cookies sit in a 0600 file in the App Group container (the Keychain path in `CookieVault` is not used on iOS); no CryptoKit or custom crypto in the app
- **Device.** `UIRequiredDeviceCapabilities = arm64`; minimum iOS 18.0 (was 15; the widgets were 17). The extension entry point lists the widgets and Controls directly instead of `NeedtWidgetBundle().body`, whose `if #available(iOS 18.0, *)` does not link in a Release device build (SwiftUI `WidgetBundleBuilder.buildOptional`, Xcode 26.6). Controls are `@available(iOS 18)`, so the list compiles only because the target is 18; a widget added to `NeedtWidgetBundle` must be added there too (//todo). The three targets deploy to 18; the project-level value stays 17 because `cap sync` copies it into `CapApp-SPM/Package.swift`, a tools-version 5.9 file where `.v18` does not exist (ios-sim and ios-archive failed with "'v18' is unavailable"). The shared packages keep their own lower macOS-driven minimums
- **Usage strings.** Camera (Take Photo in the file picker), microphone and speech (dictation in text fields), Photos add (Save Image)
- **Entitlements.** App Group on all three targets. `aps-environment` on the app only (`development`; App Store signing writes `production`): `AppDelegate` forwards the device token to the Capacitor push plugin, the page saves it at `/api/push-subscriptions/native`, and the worker sends through APNs (`src/services/push/apns.ts`) once `APNS_KEY_ID`, `APNS_TEAM_ID` and `APNS_PRIVATE_KEY` are set. No `applesignin` entitlement is needed: sign-in is the web flow in `ASWebAuthenticationSession`, not native `ASAuthorization`. The Apple provider still has to be configured in production before submission (`APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`): the app offers Google, so guideline 4.8 requires Sign in with Apple, and a button that says it is not set up fails 2.1
- **Icon, launch.** 1024 px icon and all 12 alternates have no alpha (checked by `scripts/check-static.sh`); `LaunchScreen.storyboard` exists
- **4.2, not just a website.** Native offline screen, App Shortcuts (add task, start focus, what is today), Share extension (link or text becomes a task), widgets, Controls, Live Activity, alternate icons, haptics

The three bundle ids to register, each with the App Groups capability and
`group.app.needt.ios`: `app.needt.ios`, `app.needt.ios.widgets`,
`app.needt.ios.share`. Do not enable the Sign in with Apple capability on them (web flow). Push Notifications goes on `app.needt.ios` only.

### Native pieces added for review

- Offline screen (`OfflineScreen.swift`): `NeedtViewController` wraps the web view's
  navigation delegate; when the main page fails with a network error (offline,
  host unreachable, timeout) a SwiftUI screen covers the web view with the
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
   BUILD=2           # must be higher than the last build uploaded for this version
   xcodebuild archive -project ios/App/App.xcodeproj -scheme App -configuration Release \
     -destination 'generic/platform=iOS' -archivePath build/Needt.xcarchive \
     DEVELOPMENT_TEAM=$TEAM CURRENT_PROJECT_VERSION=$BUILD MARKETING_VERSION=1.0.0 -allowProvisioningUpdates
   xcodebuild -exportArchive -archivePath build/Needt.xcarchive -exportPath build/export \
     -exportOptionsPlist ExportOptions-AppStore.plist -allowProvisioningUpdates
   ```

   `CURRENT_PROJECT_VERSION` and `MARKETING_VERSION` are set once on the project
   (the targets inherit them), so one override reaches the app and both extensions;
   `verify-archive.sh` checks the three agree. App Store Connect rejects a second
   upload of the same version and build number. Or Product > Archive in Xcode with
   the team set on the three targets and the build number raised on the project.

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
- Sign in with Apple is a web flow, so no entitlement. It must work in
  production before submission (App Review 4.8, because Google is offered, and
  2.1): it needs the Apple Developer account and the Apple provider
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

## In-app purchase (StoreKit 2)

`NeedtStore` (`NeedtPlugins.swift`) sells Needt Pro inside the app. Products:
`app.needt.pro.monthly` and `app.needt.pro.yearly` (auto-renewable, one
subscription group "Needt Pro") and `app.needt.lifetime` (non-consumable).

- `products({ ids })` returns `{ products: [{ id, displayName, description,
displayPrice, price, currencyCode, type, period?, introOffer?,
isEligibleForIntroOffer?, isFamilyShareable }] }`
- `purchase({ id, appAccountToken })` returns `{ status: "success" | "pending" |
"cancelled" | "failed", signedTransaction, productId, transactionId, message }`
- `finish({ transactionId })` returns `{ finished }`; call it only after the
  server answered 2xx
- `restore()` runs `AppStore.sync()` and returns `{ transactions }` (all current
  entitlements); `entitlements()` is the same without sync
- `pendingTransactions()` returns `{ transactions }`: `Transaction.unfinished`
  (a purchase whose post failed, survives restarts) plus updates since launch
- `manageSubscriptions()` opens the system subscription sheet
- event `transactionUpdated` carries `{ signedTransaction, productId,
transactionId }` for every verified `Transaction.updates` entry

A `Transaction.updates` listener starts when the plugin loads (app launch).
Only `VerificationResult.verified` transactions are passed on, and the plugin
never finishes one by itself. Updates stay in memory until `finish`, so
`pendingTransactions()` replays what arrived before the web was listening.
`transactionId` is a string (a 64-bit id does not always fit a JS number).

Web side: `src/lib/native-store.ts` has typed wrappers (silent no-ops outside
the iOS app, they never throw) and the flows `buyWithApple(productId)`,
`restoreApplePurchases()` and `subscribeAppleTransactionUpdates()`, which use
`GET /api/billing/apple/account-token` and `POST /api/billing/apple/transactions`.
No paywall UI is wired yet.

`purchase` rejects when `appAccountToken` is missing or not a UUID. The flows
return `{ ok: true, ... }` or `{ ok: false, reason, status?, code?, message,
manageUrl? }` (`status` and `code` are the server's). A transaction is
finished after a 2xx and after a permanent refusal (403
`APPLE_ACCOUNT_MISMATCH`, 409 `CREEM_ACTIVE` / `APPLE_TRANSACTION_IN_USE`, 400
`APPLE_UNKNOWN_PRODUCT` / `APPLE_MALFORMED` / `APPLE_INVALID_SIGNATURE`), never
after 401, 429, 5xx, a network error or the retryable codes. Unfinished ones are
looked up on subscribe, on visibility change and after a purchase, at most once
per 60 s (a purchase ignores the gap).

Local testing: `ios/App/Needt.storekit` holds the three products ($7, $59,
$149) and is referenced only by the shared `App` scheme's Run action (not
Archive), so Run from Xcode uses it. Sandbox purchases on a device use the real
App Store Connect products.

Owner steps (nothing to add to `App.entitlements`: in-app purchase has no
entitlement key on iOS): enable the In-App Purchase capability on the App ID
`app.needt.ios`, accept the Paid Applications agreement in App Store Connect,
and create the three products with the ids above (monthly and yearly in one
subscription group).

//todo: the purchase flow is built but not run. It needs a device or Simulator
with the StoreKit configuration and, for the real store, a sandbox Apple ID.
