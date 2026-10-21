# Needt desktop

Tauri v2 shell (macOS and Windows) around the hosted web app. Windows load
`https://use.needt.app` directly, so every web release reaches the desktop app
without a new build. App id `app.needt.desktop`.

## What the shell adds

| Feature         | How                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Navigation lock | `needt.app` and subdomains (https) stay in the app; every other link opens in the system browser            |
| Tray / menu bar | Open Needt, Quick add, Quit. Closing the main window hides it to the tray                                   |
| Quick add       | `Cmd+Shift+Space` (macOS) / `Ctrl+Shift+Space` (Windows): small always-on-top window on the web `/quick-add` page |
| Notifications   | `window.Notification` is shimmed over the Tauri notification plugin (WKWebView has no Web Notifications)    |
| Window state    | Size and position remembered (`tauri-plugin-window-state`), quick-add window excluded                       |
| Single instance | A second launch focuses the running app                                                                     |

Web side: `src/lib/desktop.ts` (`isDesktopApp()`, `sendDesktopNotification()`),
no-ops outside the app.

IPC is exposed to `needt.app` pages only (`capabilities/default.json`) and
limited to notification permissions.

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
changes; the output in `src-tauri/icons/` is committed).

## CI

`.github/workflows/desktop.yml` builds on `macos-26` (universal dmg) and
`windows-latest` (msi and NSIS exe) on pushes touching `apps/desktop/**` and on
`workflow_dispatch`. Artifacts: `needt-desktop-macos-universal`,
`needt-desktop-windows-x64`. Builds are unsigned.

## Running an unsigned build

- macOS: the app is not notarized, so Gatekeeper blocks it. After copying it to
  Applications: `xattr -dr com.apple.quarantine /Applications/Needt.app`, or
  right-click, Open.
- Windows: SmartScreen warns "unknown publisher"; More info, Run anyway.

## Waits for signing and release work

- macOS: Apple Developer ID certificate, then signing and notarization in CI
  (`APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_TEAM_ID` secrets). Until then no
  clean double-click install.
- Windows: code-signing certificate (Authenticode or Azure Trusted Signing).
- Auto-update: `tauri-plugin-updater` needs an updater keypair
  (`tauri signer generate`), a release endpoint (GitHub Releases) and a
  release workflow that uploads signed bundles plus `latest.json`. Not wired.
- Release publishing: CI only uploads workflow artifacts; no GitHub Release.

## Known limits

- Unverified on real hardware: native notification shim, global shortcut and
  tray behaviour were built in CI only.
- OAuth sign-in through a provider that blocks embedded webviews (Google) will
  not work in the app window: such pages open in the system browser and the
  session does not come back. Email sign-in is unaffected. Needs a deep-link
  callback (`needt://`) before it can be solved.
- Web push (service worker) is not available in the webview; use the
  notification shim.
