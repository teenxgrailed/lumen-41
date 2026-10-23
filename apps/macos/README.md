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

## Auto-update (Sparkle 2) and releasing

The direct build (`Needt`) updates itself with Sparkle 2: a check once a day
(`SUScheduledCheckInterval`), **Needt > Check for Updates…**, and the version
plus a Check button in **Settings > About**. The App Store build compiles
Sparkle out (the `APPSTORE` flag) and shows none of this.

The updater stays off, with a log line (`Updates are off`, subsystem
`app.needt.mac`), when the build has no `SUPublicEDKey`. It never crashes.

How it fits together:

| Piece | Where |
| --- | --- |
| Release workflow | `.github/workflows/macos-release.yml` (tag `mac-vX.Y.Z` or run by hand with a version) |
| Zip | GitHub Release `mac-vX.Y.Z`, asset `Needt-X.Y.Z.zip` |
| Appcast | release `mac-appcast`, asset `appcast.xml`, replaced on every release |
| Feed URL in the app | `https://github.com/teenxgrails/needt/releases/download/mac-appcast/appcast.xml` (`SUFeedURL` in `project.yml`) |
| Public key in the app | build setting `SPARKLE_PUBLIC_ED_KEY`, filled from the repository variable `SPARKLE_ED_PUBLIC_KEY` |
| Private key | secret `SPARKLE_ED_PRIVATE_KEY`, read only by the "Sign the zip" step |

The appcast is a release asset, not a page on needt.app: the repository is
public, the URL is stable, and no landing deploy is involved. If it should live
on `https://needt.app/...` later, change `SUFeedURL` and copy the asset into
`landing-site/` from the workflow.

`CFBundleShortVersionString` is the tag (`mac-v0.2.0` gives `0.2.0`) and
`CFBundleVersion` is the workflow run number, which only grows. Both go in as
build settings, so the Share extension and the widgets match the app.

### One-time setup (the owner, on a Mac)

Run `generate_keys` from the Sparkle release (`bin/generate_keys` in
`Sparkle-2.6.4.tar.xz` from github.com/sparkle-project/Sparkle/releases). It
keeps the private key in the login Keychain and prints the public key.

```bash
./bin/generate_keys -x ~/needt-sparkle-private.key
gh secret set SPARKLE_ED_PRIVATE_KEY -R teenxgrails/needt < ~/needt-sparkle-private.key
gh variable set SPARKLE_ED_PUBLIC_KEY -R teenxgrails/needt --body "<public key printed by generate_keys>"
```

Then keep the private key only in the password manager and delete the file.
Never paste it anywhere else, never commit it. Losing it means shipping a new
key by a full reinstall. Release with
`git tag mac-v0.2.0 && git push origin mac-v0.2.0`, or run "macOS release" from
the Actions tab. Without the secret or the variable the workflow stops at its
first step with a message saying which one is missing.

### Unsigned builds and Gatekeeper

There is no Apple Developer account yet, so releases are unsigned (ad-hoc
signed so Apple Silicon will start them). Sparkle verifies every update with
the EdDSA signature, so updates install, but:

- The first install from the zip is blocked by Gatekeeper. Open it once with
  right-click > Open, or `xattr -dr com.apple.quarantine /Applications/Needt.app`.
- An update that Sparkle downloads may be quarantined the same way. If Needt
  does not reopen after an update, run the same `xattr` command once.
- Once a Developer ID exists, add the secrets named at the top of
  `macos-release.yml`; its "Developer ID sign and notarize (hook)" step (never
  run yet) then signs, notarizes and staples. Sparkle will not replace an app
  signed by one identity with one signed by another, so make the switch before
  people rely on updates, and expect one manual reinstall for copies installed
  from unsigned builds.


## Widgets

`Widgets/Sources` is a WidgetKit extension (`NeedtWidgets`, bundle id
`app.needt.mac.widgets`, sandboxed, same App Group as the app). It embeds in
both the direct and the App Store build. Like the iPhone one it is only an entry
point: the views, widgets and intents are in `apps/shared/NeedtWidgetKit`, the
data in `apps/shared/NeedtKit`.

- Today (small, medium, large and extra large), Next event, Focus timer,
  Habits (Free shows 3), Quick add. Eight styles per widget in its Edit menu,
  D Ink by default. The Add task and Start focus Controls are in the code but
  only the iPhone bundle lists them: on macOS 26 they need the extension itself
  to target macOS 26 (an `if #available` in the widget bundle does not link
  below that), a follow-up.
- The session comes from the vault the app already fills (`SessionSync`); the
  app reloads the widgets whenever it refreshes or clears it.
- `needt://open?path=/today` (also `/focus`, `/habits`, `/calendar`,
  `/quick-add`, `/tasks`) opens that screen; `/quick-add` opens the native Quick
  add panel. The Quick add Control leaves a pending link the app reads when it
  comes forward.
- A focus Live Activity started on a paired iPhone shows in the Mac menu bar
  with no Mac code (macOS 26).
- [unverified] Mac widget sizes (158 x 158, 338 x 158, 338 x 354, 715 x 338 pt)
  and how tinted / clear rendering looks on macOS 26: Apple publishes no table
  and the HIG lists accented as unsupported on Mac while WWDC25 says it applies.
  Tinted, clear and vibrant use the D Ink layout either way. Check in Xcode
  previews on a macOS 26 machine.

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

## The notch island

`Island/` is the notch island (a fork of Atoll, itself a fork of boring.notch,
GPL v3 - see `Island/LICENSE.txt` and `Island/ACKNOWLEDGEMENTS.md`). It is compiled
into the Mac app, not run beside it. Needt's `AppDelegate` owns the lifecycle
and calls `IslandHost` (`Needt/Sources/IslandHost.swift`); the island runs only
for Pro (`IslandEntitlement`, from `GET /api/billing`) and only while
Settings, Island has it on. The Needt modules (`Island/Sources/components/Needt`)
read the menu bar's `TrayStore` and write through `NeedtAPI`.

Two builds from the same sources:

| Target | Island | Sandbox | Updates |
| --- | --- | --- | --- |
| `Needt` | all of it | no (the full island needs it) | Sparkle |
| `NeedtAppStore` | minus everything in the `excludes` of its `Island/Sources` entry in `project.yml`; inert stand-ins in `Island/AppStore` | yes | none |

`scripts/check-appstore-private-api.py` (run by CI) fails when a source
compiled into `NeedtAppStore` names a private interface. Music in the App
Store build is Apple Music and Spotify through Apple Events
(`com.apple.security.scripting-targets`). To add a feature to the island that
uses a restricted interface, add the file to the App Store `excludes` and a
stand-in to `Island/AppStore/AppStoreStubs.swift`.

Because GPL code ships inside Needt.app, the Mac app's source must be offered
under GPL v3.
