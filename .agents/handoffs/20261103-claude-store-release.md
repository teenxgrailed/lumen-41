---
id: 20261103-claude-store-release
owner: claude
branch: docs/store-release
status: complete
updated: 2026-11-03T09:30:00Z
objective: iOS, Mac App Store and Microsoft Store builds are ready for the owner to sign, upload and submit
---

## Scope

- Governing plan/spec: owner brief in chat 2026-11-03 (store readiness for apps/ios, apps/macos, apps/desktop)
- In scope: archive/export CI, privacy manifests, entitlements, usage strings, store metadata, screenshots, store-mode web, Apple IAP behind a flag, docs/release/STORE-RELEASE.md
- Out of scope: signing, App Store Connect / Partner Center records, payments, submission (owner only)

## Completed

- Merged: #533 (demo account may schedule deletion), #534 (store metadata, review notes, screenshot workflow), #535 (Mac App Store archive, privacy, entitlements, MAS island cut to 241 files), #537 (store mode hides purchase UI), #538 (Windows MSIX), #539 (iOS archive, privacy, offline screen, Shortcuts, Share extension, iOS 18), #540 (StoreKit plugin), #541 (Apple IAP server, flag apple_iap off), #543 (/support), #549 (App Store purchase sheet), #554 (iOS web view crash on load), #562 (screenshots shot only when loaded)
- This branch: .github/workflows/store-upload.yml (cloud-signed archive + upload by hand), docs/release/STORE-RELEASE.md
- Needt: 14 owner tasks in project "Needt Apps (desktop + mobile)"

## Working state

- Files currently dirty or expected to change: none
- Foreign changes that must remain untouched: everything dirty in /Users/lol/Needt main checkout

## Verification

- Passed: ios-archive run 41585903300, macos.yml run 41584828840, desktop.yml run 41570506245, store-screenshots run 41598850812 (28 shots)
- Not run / still required: anything signed (store-upload.yml needs owner secrets), device runs, real or Sandbox purchase, Windows install

## Decisions and constraints

- Store builds hide every purchase CTA unless apple_iap is on (then StoreKit only).
- Sandbox-signed Apple purchases on production: reviewer account and APPLE_IAP_SANDBOX_TESTERS only, 24 h Pro, never Lifetime.
- No signing material created or stored; Team ID placeholder.

## Blockers

- Owner: decisions on IAP, GPL island, Partner Center account type; Apple Developer Program; Sign in with Apple keys; ASC API key secrets.
- Before apple_iap goes on: /terms §5 must describe App Store purchases (today the app version says Pro is not sold in the app).
- .claude/nm-base lacks @apple/app-store-server-library (integrator refreshes).

## Next action

- When the owner decides on IAP: change /terms §5 app-version text, then Mac StoreKit (WebBridge) if IAP should also sell in the Mac App Store.
