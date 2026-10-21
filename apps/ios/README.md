# Needt for iOS

A Capacitor 8 shell around the web app. The app does not bundle the UI: the
WebView loads `https://use.needt.app` (`server.url` in `capacitor.config.json`),
so every web deploy reaches the iOS app at once. Navigation is limited to
`needt.app` hosts; anything else opens outside the app.

- App id `app.needt.ios`, name "Needt"
- Native project uses Swift Package Manager (no CocoaPods)
- Plugins: App, Haptics, Push Notifications, Share, Splash Screen, Status Bar
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

## Waiting for the Apple Developer account

| Item | Why it waits |
| --- | --- |
| Signing and a real device | Needs a team id and a development certificate |
| Push (APNs) | Needs the Push Notifications capability and an APNs key; add `aps-environment` entitlement, send the device token to the server, deliver from the worker. Web push stays as it is meanwhile |
| TestFlight / App Store | Needs App Store Connect record, distribution signing, privacy answers and review notes |
| Bundle id registration | `app.needt.ios` must be registered in the developer portal |
| Sign in with Apple | Required by App Review if other social logins are offered |

Icon and splash are upscaled from `public/icons/icon-maskable-512.png`; replace
`ios/App/App/Assets.xcassets` with a 1024 px master before submission.
