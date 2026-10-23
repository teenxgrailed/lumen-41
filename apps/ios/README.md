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
screenshot as the `needt-ios-simulator` artifact.

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
| Bundle id registration    | `app.needt.ios` and `app.needt.ios.widgets` must be registered, both with the App Groups capability and `group.app.needt.ios`                                                                                                                                  |
| Sign in with Apple        | Required by App Review if other social logins are offered                                                                                                                                   |

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

//todo: the Swift plugin `NeedtAppIcon` (wrapping
`UIApplication.shared.setAlternateIconName`) is not written: it needs a
device or Simulator to verify and a local-plugin registration in the Xcode
project. Until it exists the choice only changes the web-side icons.
