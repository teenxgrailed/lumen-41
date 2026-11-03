---
id: 20261103-claude-store-release
owner: claude
branch: docs/store-release
status: active
updated: 2026-11-03T12:00:00Z
objective: iOS, Mac App Store and Microsoft Store builds are ready for the owner to sign, upload and submit
---

## Scope

- Governing plan/spec: owner brief in chat 2026-11-03 (store readiness for apps/ios, apps/macos, apps/desktop)
- In scope: archive/export CI, privacy manifests, entitlements, usage strings, store metadata, screenshots, web "store distribution" mode that hides purchase UI, docs/release/STORE-RELEASE.md
- Out of scope: signing, App Store Connect / Partner Center records, payments, submission (owner only)

## Completed

- None yet

## Working state

- Coordinator worktree `.claude/worktrees/store-release` (this file, docs/release/STORE-RELEASE.md)
- Parallel worker branches (each in its own worktree from origin/main):
  - `feat/store-mode-web` — src/lib/native.ts, paywall/plan/onboarding components
  - `feat/ios-store-ready` — apps/ios/**, .github/workflows/ios-sim.yml, new ios-archive job
  - `feat/mac-store-ready` — apps/macos/**, .github/workflows/macos.yml
  - `feat/windows-msix` — apps/desktop/**, .github/workflows/desktop.yml
  - `feat/store-metadata` — apps/{ios,macos,desktop}/store/**, .github/workflows/store-screenshots.yml
- Foreign changes that must remain untouched: everything dirty in /Users/lol/Needt main checkout

## Verification

- Passed: none yet
- Not run / still required: green archive + export CI per target, privacy manifest lint, purchase-link grep

## Decisions and constraints

- MAS build injects `window.__needtNative.distribution = "appstore"`; iOS app is always a store build. Web hides every purchase CTA in both (App Review 3.1.1 / 3.1.3(f)).
- No signing material is created or stored; Team ID is a placeholder `YOUR_TEAM_ID`.
- No simulator, browser or Xcode GUI on the owner's Mac; screenshots in CI only.

## Blockers

- Apple Developer Program, Sign in with Apple keys, APNs key, Partner Center account: owner.

## Next action

- Collect worker PRs, review with reviewer agent, merge green ones, then write docs/release/STORE-RELEASE.md.
