# Needt desktop

Tauri v2 app (macOS and Windows). It is the same Needt interface as the
browser, loaded from `https://use.needt.app` (one codebase, every web release
reaches the app without a new build), with native layers around it: a start
window and browser-based sign-in, a native menu, a menu-bar menu with today's
tasks, a Dock badge, a global quick-add shortcut, notifications and an offline
page. App id `app.needt.desktop`.

## What the shell adds

| Feature         | How                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start window    | 440 x 520, centred, not resizable, bundled (`dist/index.html`). Four states: start, browser open, signing you in, link expired. Shown until this machine has signed in once                                                               |
| Sign-in         | System browser plus a `needt://auth` deep link (below). Google works: providers refuse embedded webviews                                                                                                                                  |
| Native Mac look | Overlay title bar: traffic lights at (18, 20) over the web app's own top bar (the 52 px drag handle); sidebar toggle at x 78. Vibrancy (macOS only): transparent window, under-window material, translucent sidebar                       |
| App menu        | Needt / File / Edit / View / Window / Help; custom items call the web app (routes, composer, sidebar, settings)                                                                                                                           |
| Menu-bar menu   | Template "n" icon alone; while a focus runs, icon plus the time left (mm:ss, ticked here). Menu: running focus (Pause, End), next 3 tasks with time, Open / Quick add / Start focus / Quit. Rows are cut with an ellipsis to about 330 px |
| Dock badge      | Overdue tasks only (macOS), hidden at 0                                                                                                                                                                                                   |
| Quick add       | `Cmd+Shift+Space` (macOS) / `Ctrl+Shift+Space` (Windows): borderless always-on-top 620 px card in the upper third of the active screen, on the web `/desktop-quick-add` page; closes on Esc, Enter or focus leaving                       |
| Notifications   | `window.Notification` is shimmed over the Tauri notification plugin (WKWebView has no Web Notifications)                                                                                                                                  |
| Offline page    | Start or Reload with no connection shows `dist/offline.html` (not a browser error) and retries every 10 s                                                                                                                                 |
| Navigation lock | `needt.app` and subdomains (https) stay in the app; every other link opens in the system browser                                                                                                                                          |
| Window state    | Size and position remembered (`tauri-plugin-window-state`); quick-add and start windows excluded                                                                                                                                          |
| Single instance | A second launch focuses the running app                                                                                                                                                                                                   |

Web side: `src/lib/desktop.ts` (`isDesktopApp()`, `desktopPlatform()`,
`onDesktopCommand()`, `emitDesktopEvent()`, `sendDesktopNotification()`), all
no-ops outside the app; `src/components/needt3/shell/DesktopBridge.tsx` (menu
commands, tray feed, drag regions, `data-desktop` on `<html>`);
`src/styles/v3-overrides/desktop-app.css` (everything gated by
`html[data-desktop]`, so browser behaviour is unchanged; the vibrancy rules
also need `data-vibrancy="on"`, which the page sets only when the shell says it
made the window transparent), `src/components/needt3/desktop/DesktopQuickAdd.tsx`
with `desktop-quick-add.css`. Design source: `additions-2/desktop-chrome`
(prefix `dk-`).

## Sign-in

No web sign-in page is ever shown in the app.

1. "Sign in" on the start window (or `needt://start-sign-in` from the web app)
   makes a random 32-byte `verifier`, keeps it in memory (single use, ten
   minutes) and opens the system browser on
   `/auth/desktop?challenge=base64url(sha256(verifier))`.
2. The person signs in there the normal way. `/auth/desktop` is behind the
   middleware, so a stranger is sent through sign-in first. A button
   ("Open Needt") posts the challenge to `POST /api/auth/desktop/code` and the
   page navigates to `needt://auth?code=<one-time code>`.
3. The OS hands the link to the app (`tauri-plugin-deep-link`, single-instance
   forwards it to the running copy). The app loads
   `/auth/desktop-complete#code=...&verifier=...` in its main window. The
   fragment never reaches a server, a log or a Referer; the page strips it
   from the address at once.
4. That page posts both to `POST /api/auth/desktop/exchange`, which sets the
   NextAuth session cookie in the app's own webview, and goes to `/today`.
   While this runs the start window shows "Signing you in…" and the main
   window loads hidden; the signed-in page reports (`needt-signed-in`), the
   main window is shown and the start window closes. A failed exchange
   (`needt-desktop-failed`) or a link that arrived after its ten minutes shows
   "That sign-in link expired" in the start window instead. After 20 s without
   a report the main window is shown anyway.
5. The app writes a marker in its data folder and opens straight to Today on
   later launches. If the session ends, the web app redirects to
   `/auth/signin`; the shell cancels that navigation, forgets the marker and
   shows the start window.

Server half: `src/lib/auth/desktop-handoff.ts`, `prisma` model
`DesktopAuthCode`. Codes are 256 random bits, stored as SHA-256, bound to the
user, 60 s life, single use (claimed atomically, and burned even when the
verifier is wrong). Both endpoints need same-origin JSON plus the
`x-needt-desktop` header (a cross-site form or fetch cannot send it without a
preflight this server never answers) and are rate limited. It is not a login
bypass: issuing a code needs a valid session and a click.

## What works offline

Offline mode is the web app's own, unchanged: the service worker
(`public/sw.js`) caches the app shell (`/_next/static`), the last page loaded
per user and workspace, snapshots of `/api/tasks` and the schedule, and queues
edits to tasks, the daily agenda and document blocks for sync when back
online (IndexedDB `needt-offline-v2`). Settings, General, "Offline mode" is on
by default (`PREF_DEFAULTS.offline`); the switch is stored but the worker
registers regardless.

Desktop-specific, independent of the service worker:

- Starting or reloading with no connection shows the bundled offline page and
  returns to Today when the network is back.
- The shell does not reload a page that is already open while offline.

**Unverified:** whether WKWebView (macOS) runs the service worker for a remote
origin in this app. If it does not, the shell, the cached pages and the offline
edit queue do not work on macOS and only the offline page above does. Check in
Safari, Develop, the Needt window: `navigator.serviceWorker` and
`await navigator.serviceWorker.getRegistration()`.

## Run locally

Needs Node 22 and Rust (https://rustup.rs). On Windows also the WebView2
runtime and MSVC build tools.

```bash
cd apps/desktop
npm ci
npm run dev                                   # loads https://use.needt.app
NEEDT_DESKTOP_URL=http://localhost:3000 npm run dev   # against a local web app (debug builds only)
npm run build                                 # bundles for the current OS
```

Bundles land in `src-tauri/target/release/bundle/`. Icons are generated from
`public/brand/needt-icon.svg` with `npm run icons` (re-run only when the mark
changes; the output in `src-tauri/icons/` is committed). `dist/icon.png` is
`icons/128x128@2x.png`.

The `needt://` scheme is registered by the installed app (macOS bundle
Info.plist, Windows at start). A `tauri dev` build on macOS is not an app
bundle, so the OS will not route `needt://auth` to it; test sign-in with a
built `.app`.

## CI

`.github/workflows/desktop.yml` builds on `macos-26` (universal dmg) and
`windows-latest` (msi and NSIS exe) on pushes touching `apps/desktop/**` and on
`workflow_dispatch`. Artifacts: `needt-desktop-macos-universal`,
`needt-desktop-windows-x64`. Builds are unsigned. `Cargo.lock` is resolved in
CI; commit the refreshed lock after the first local build.

## Running an unsigned build

- macOS: the app is not notarized, so Gatekeeper blocks it. After copying it to
  Applications: `xattr -dr com.apple.quarantine /Applications/Needt.app`, or
  right-click, Open.
- Windows: SmartScreen warns "unknown publisher"; More info, Run anyway.

## Follow-ups (not in this phase)

- Bundle the UI inside the app instead of loading it from the server (instant
  start, true offline shell without depending on the service worker).
- A full local-first sync engine (reads and writes against a local store, not a
  cache of server responses).
- Spotlight and widgets (Today widget, Spotlight task search).
- Signing and notarization: Apple Developer ID certificate, then signing and
  notarization in CI (`APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_TEAM_ID`).
  Windows: Authenticode or Azure Trusted Signing certificate.
- Auto-update: `tauri-plugin-updater` needs an updater keypair
  (`tauri signer generate`), a release endpoint (GitHub Releases) and a release
  workflow that uploads signed bundles plus `latest.json`.
- Release publishing: CI only uploads workflow artifacts; no GitHub Release.

## Known limits

- Vibrancy needs `macOSPrivateApi` (a transparent window); that rules out the
  Mac App Store, which the app is not on. The owner lifted PORT.md's opaque
  ground rule for the native sidebar only (21.10.26).
- A native menu cannot be given a width or item icons through Tauri's menu
  API: the 330 px menu is an ellipsis at about 42 characters, and rows carry
  text and key hints only (the spec's template icons are not drawn).
- No "Dock badge" off switch yet (spec: Settings, Notifications).
- Unverified on real hardware: everything native here was built in CI only
  (menu, tray menu, Dock badge, traffic-light inset, deep link, drag region).
- Linking a provider (Google, Outlook) from Settings opens the system browser;
  the result does not come back into the app's session. Sign-in itself is
  fine.
- Web push (service worker) may not be available in the webview; use the
  notification shim.
- Any local program can open `needt://auth?code=...`. Without the app's
  verifier the code is useless, but a flood of such links can cancel a
  pending sign-in (the verifier is single use); the person starts again.
