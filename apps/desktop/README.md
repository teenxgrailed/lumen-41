# Needt desktop

Tauri v2 app (macOS and Windows). It is the same Needt interface as the
browser, loaded from `https://use.needt.app` (one codebase, every web release
reaches the app without a new build), with native layers around it: a start
window and browser-based sign-in, a native menu, a menu-bar menu with today's
tasks, a Dock badge, a global quick-add shortcut, notifications and an offline
page. App id `app.needt.desktop`.

## What the shell adds

| Feature         | How                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Start window    | Small, centred, bundled (`dist/index.html`): icon, "Sign in". Shown until this machine has signed in once         |
| Sign-in         | System browser plus a `needt://auth` deep link (below). Google works: providers refuse embedded webviews          |
| Native Mac look | Overlay title bar: traffic lights sit over the web app's own top bar, which is the drag handle                    |
| App menu        | Needt / File / Edit / View / Window / Help; custom items call the web app (routes, composer, sidebar, settings)   |
| Menu-bar menu   | Next 3 tasks of today with time, running focus session, Open / Quick add / Quit; click a task to open it          |
| Dock badge      | Today's open tasks plus overdue (macOS), the same count as the installed web app's badge                          |
| Quick add       | `Cmd+Shift+Space` (macOS) / `Ctrl+Shift+Space` (Windows): small always-on-top window on the web `/quick-add` page |
| Notifications   | `window.Notification` is shimmed over the Tauri notification plugin (WKWebView has no Web Notifications)          |
| Offline page    | Start or Reload with no connection shows `dist/offline.html` (not a browser error) and returns by itself          |
| Navigation lock | `needt.app` and subdomains (https) stay in the app; every other link opens in the system browser                  |
| Window state    | Size and position remembered (`tauri-plugin-window-state`); quick-add and start windows excluded                  |
| Single instance | A second launch focuses the running app                                                                           |

Web side: `src/lib/desktop.ts` (`isDesktopApp()`, `desktopPlatform()`,
`onDesktopCommand()`, `emitDesktopEvent()`, `sendDesktopNotification()`), all
no-ops outside the app; `src/components/needt3/shell/DesktopBridge.tsx` (menu
commands, tray feed, drag regions, `data-desktop` on `<html>`);
`src/styles/v3-overrides/desktop-app.css` (everything gated by
`html[data-desktop]`, so browser behaviour is unchanged).

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
- Vibrancy behind the sidebar. Needs a transparent window
  (`macOSPrivateApi`) and a translucent sidebar ground, which changes the
  ground and elevation rules in `docs/handoff/PORT.md` section 0; an owner
  design decision first.
- Signing and notarization: Apple Developer ID certificate, then signing and
  notarization in CI (`APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_TEAM_ID`).
  Windows: Authenticode or Azure Trusted Signing certificate.
- Auto-update: `tauri-plugin-updater` needs an updater keypair
  (`tauri signer generate`), a release endpoint (GitHub Releases) and a release
  workflow that uploads signed bundles plus `latest.json`.
- Release publishing: CI only uploads workflow artifacts; no GitHub Release.

## Known limits

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

## App icon (Dock)

The bundled icon is Midnight. When the person picks another icon the web app
emits the Tauri event `app-icon` with `{ id }` (`emitDesktopEvent`).

//todo: nothing listens yet. Setting the Dock tile at runtime on macOS needs
`NSApplication.setApplicationIconImage` through `objc2`, with the PNGs from
`public/app-icons/<id>/`; it cannot be verified in CI, so it is left for a
Mac build. Windows keeps the bundled icon.
