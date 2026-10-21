# Needt for Mac (native)

SwiftUI/AppKit app, macOS 14+, bundle id `app.needt.mac`. It hosts the same
Needt interface as the browser, loaded from `https://use.needt.app` in a
`WKWebView`, with native Mac features around it. The interface keeps updating
from the server; the app itself only updates when a native part changes
(Sparkle). Windows keeps the Tauri app in `apps/desktop`, whose macOS build is
now legacy.

The project is text: `project.yml` (XcodeGen) generates `Needt.xcodeproj`,
which is not committed. Sources are in `Needt/Sources`, the asset catalog in
`Needt/Resources`. The shared Swift package is `apps/shared/NeedtKit`.

## Build

On a Mac with Xcode 26 (CI does exactly this, see
`.github/workflows/macos.yml`):

```bash
brew install xcodegen
cd apps/macos
xcodegen generate
xcodebuild -project Needt.xcodeproj -scheme Needt -configuration Release \
  -destination 'platform=macOS' -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO build
```

CI uploads `needt-macos-unsigned` (the zipped `Needt.app`, a start-window
screenshot and the launch log). The build is unsigned and not notarized, so
Gatekeeper blocks it: `xattr -dr com.apple.quarantine Needt.app`, or
right-click, Open.

Debug builds can point at a local web app: `NEEDT_URL=http://localhost:3000`.

## What it does (parity with the Tauri Mac app)

| Feature         | How                                                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start window    | SwiftUI, 440 x 520, not resizable; states start, browser, back (signing in), error, 1:1 with `dk-chrome` in the design bundle (`additions-2/desktop-chrome`)                                   |
| Sign-in         | System browser plus `needt://auth?code=` deep link, the existing PKCE one-time-code endpoints unchanged (`AuthFlow.swift`); the session cookie lands in `WKWebsiteDataStore.default()`         |
| Main window     | Transparent full-size title bar, traffic lights at (18, 20), size and position remembered, closing hides it (the app stays in the menu bar)                                                    |
| Drag area       | Elements the web app marks `data-tauri-drag-region` drag the window; double click zooms                                                                                                        |
| Vibrancy        | `NSVisualEffectView` (`.underWindowBackground`) behind the page, switched on only while `html[data-desktop="mac"][data-vibrancy="on"]` (see Web side)                                          |
| Menus           | Needt / File / Edit / View / Window / Help, same items and shortcuts as the Tauri app (`MainMenu.swift`)                                                                                       |
| Menu-bar item   | `MenuBarExtra`: the n glyph alone; glyph plus `mm:ss` while a focus runs. Menu: focus block (Pause/Resume, End), Today · N open, next 3 tasks, Open, Quick add, Start focus on next task, Quit |
| Dock badge      | Overdue count only, hidden at 0                                                                                                                                                                |
| Quick add       | Global `⇧⌘Space` (Carbon hot key, no permission prompt); borderless always-on-top 620 pt panel in the upper third of the active screen, loading `/quick-add`; Esc or losing focus closes it    |
| Notifications   | `window.Notification` is shimmed over `UNUserNotificationCenter`                                                                                                                               |
| Offline         | SwiftUI offline screen over the web view when the page cannot be loaded; retries every 10 s and when the network returns                                                                       |
| Navigation lock | `needt.app` and subdomains (https) stay in the app, everything else opens in the default browser; `needt://start-sign-in` / `cancel-sign-in` are the only app words                            |
| Single instance | A second launch brings the running app forward                                                                                                                                                 |
| Auto-update     | Sparkle 2, off until the public key is set (below)                                                                                                                                             |

## Web side: nothing breaks, one thing to switch on

The web app already speaks a bridge to the Tauri shell (`src/lib/desktop.ts`,
`DesktopBridge.tsx`). This app implements the same messages through a
`WKScriptMessageHandler`, so that code runs unchanged: `window.__needtDesktop`
(platform `mac`, `dispatch`, `setHandler`), a `window.__TAURI__` shim with only
`event.emit` and `notification`, and `window.Notification`. A marker
`window.__needtNative = { platform: "mac-swift" }` tells the two shells apart.
Only `needt.app` pages get the bridge, and the native side checks the origin of
every message.

Changes made to the web app for this PR (additive, browsers and the Tauri app
are unaffected): `trayState()` also reports `overdue`, `focusEndsAt` (epoch ms)
and `focusTitle`, which the menu-bar countdown and the Dock badge need.

Not switched on yet: vibrancy. The native side is ready and waits for
`html[data-vibrancy="on"]`; the web app does not set it and has no transparent
sidebar ground yet. That is a web change plus the design ruling already
recorded in the dk-chrome header (PORT.md's "no translucency" rule is lifted
for the native sidebar, content stays opaque).

## Differences from the Tauri Mac app

- Dock badge: overdue only (Tauri: today's open plus overdue), as the
  dk-chrome spec says. The Settings, Notifications, "Dock badge" switch is a
  web setting that is not wired to the shell yet.
- Menu bar: native `MenuBarExtra` menu with the spec's focus block and
  mm:ss countdown. Pause, Resume, End and Start focus call the web API
  (`POST /api/focus/session`) with the web view's session cookie, through
  `NeedtKit`; unverified against production until run on a real Mac.
- The start and offline screens are native SwiftUI, not bundled HTML.
- Quick add loads `/quick-add` (the existing page). The brief named
  `/desktop-quick-add`; that route does not exist in the web app.
- "Create an account" on the start window opens the same browser sign-in page
  (the web sign-in has the account creation).
- Updates: Sparkle instead of an updater plugin.
- Downloads from the page are not handled yet (a navigation that is not a page
  does nothing).

## Auto-update (Sparkle 2): what the owner does

The app asks `https://needt.app/desktop/appcast.xml`. It only checks once a
public key is set; no key is generated or stored in this repository.

1. On a Mac with the Sparkle tools (from the Sparkle release or SPM artifacts
   `bin/`), generate the EdDSA keypair once:

   ```bash
   ./bin/generate_keys
   ```

   It stores the private key in the login Keychain and prints the public key.
   Back up the private key (`./bin/generate_keys -x private-key-file`) in the
   password manager; losing it means shipping a new key by a full reinstall.

2. Put the public key in `apps/macos/project.yml`, `SPARKLE_PUBLIC_ED_KEY`
   (a public key is safe to commit), or pass it as a build setting in CI.
3. Add the private key as a GitHub Actions secret `SPARKLE_PRIVATE_KEY`. The
   release workflow (not written yet) signs each zip with
   `./bin/sign_update`, writes `appcast.xml` (`generate_appcast`) and uploads
   both next to the download.
4. Publish `appcast.xml` at `https://needt.app/desktop/appcast.xml`.

Updates also need a Developer ID signed and notarized app (below); Sparkle
refuses to replace an app signed by a different identity.

## What needs the owner

- Apple Developer Program membership (99 USD a year): a Developer ID
  Application certificate, an app-specific password or App Store Connect API
  key for `notarytool`, the team id. Then CI can sign, notarize and staple
  (`CODE_SIGN_IDENTITY`, `DEVELOPMENT_TEAM`, `xcrun notarytool submit --wait`).
  Hardened runtime is already on.
- The Sparkle keypair (above) and the appcast hosting.
- A real-Mac pass: everything native here was built in CI only.

## System integration

| Feature         | How                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App Intents     | `Needt/Sources/Intents`: Add task, Complete task, Start focus, End focus, What's today, What's next, Replan day, Log habit, with phrases for Siri and Spotlight. Same HTTP API as the web app, signed in by the session vault |
| Spotlight       | Open tasks are indexed (CoreSpotlight, up to 200); a click opens the task in the main window                                                                                                                              |
| Focus to macOS  | Settings, Focus: the name of a Shortcut to run when a Needt focus starts and one for when it ends (`shortcuts://run-shortcut`). Make them with the Set Focus action                                                       |
| macOS to Needt  | System Settings, Focus, Focus Filters, Needt: suggest the next task of a project in the menu, or start the focus. Unverified on a real Mac: whether the system also calls the filter with its defaults when the Focus ends |
| Menu bar text   | `24:10 · task` only while a focus runs (`Text(timerInterval:)`, no timer in the app); the icon alone otherwise                                                                                                            |
| Share extension | `Share/`: URL or text, title = page title or first line, link in the notes                                                                                                                                                |
| Offline         | `NeedtKit.OfflineCache` keeps the last day report and task list; the menu and the offline screen show them read-only with "Offline · updated HH:mm"; Quick add, pause, end and start focus are disabled. No edit queue      |
| Sandbox         | Every target has `app-sandbox`, `network.client`, `application-groups`; the apps also `files.user-selected.read-only` and camera and microphone for the page                                                              |

The session for intents and the Share extension is copied from the web view
into `NeedtKit.CookieVault`: a 0600 file in the App Group container (the
keychain access group is supported by the vault but needs a provisioning
profile, so it stays off). The app group is `<TeamID>.app.needt.mac`, set by
the signing team; unsigned builds fall back to a private folder, where the
Share extension cannot see the session.

### Mac App Store

`xcodegen generate` makes two app targets from the same sources: `Needt`
(Developer ID, Sparkle) and `NeedtAppStore` (compilation flag `APPSTORE`, no
Sparkle package, no update menu item, no mach-lookup exception). Both embed the
Share extension. CI builds both unsigned, checks that the store build has no
Sparkle, checks the generated entitlements, and fails on private-API patterns
(the old `drawsBackground` KVC is gone; the window is opaque).

Needs the owner: an Apple Developer Program team, the App ID `app.needt.mac`
and `app.needt.mac.share`, the app group `<TeamID>.app.needt.mac`, a Mac App
Distribution certificate and provisioning profiles, then archive
`NeedtAppStore` and upload with Transporter. Pro is sold on the site only.

## Phase 2 (not in this PR)

- WidgetKit widgets (Today, focus) reading `NeedtKit`.
- Handoff between the Mac app, the iOS app and the web.
- Vibrancy on (web side), downloads, the Dock icon chosen in Settings
  (`app-icon` setting; `NSApplication.applicationIconImage`).

`apps/shared/NeedtKit` is the base for those and for the iOS app (Capacitor,
SPM): `NeedtAPI` (cookie-signed HTTP client), `TrayState`, `FocusSession`,
`TaskSummary`. Foundation only; `swift test` runs it in CI.
