---
id: 20261113-claude-redesign-remaining
owner: claude
branch: feat/redesign-remaining
status: active
updated: 2026-11-13T02:00:00Z
objective: Move the pages still on the old shadcn UI to needt3, with before/after screenshots, and propose simplifications for overloaded screens
---

## Scope

- Governing plan/spec: docs/handoff/PORT.md, docs/port/prototype/UI-RULES.md; task brief in FEATURE.md.
- In scope: presentation-only ports listed in REDESIGN-AUDIT.md §3 items 1–8.
- Out of scope: PageWorkspace editor, moodboard canvas, /admin/system, SetupForm, AccountSettings embed, AppShell signed-out branch (listed as not done in FEATURE.md). Product freeze until 17.11.2026: nothing reaches main.

## Completed

- b55176e0 audit; 67d97564 admin operations + share; 00dc1b48 PublicScope + small public cards; fd7e9f9b legal + public moodboard; 8e8b9847 booking + OAuth consent.

## Working state

- Files currently dirty or expected to change: FEATURE.md, docs/redesign-shots/, tests/redesign-shots.spec.ts, playwright.redesign.config.ts.
- Foreign changes that must remain untouched: .brief.md (task brief, untracked).

## Verification

- Passed: type-check, eslint on changed files, jest for touched folders (see FEATURE.md for the full-suite result).
- Not run / still required: full Playwright e2e suite (needs its own docker-compose.e2e stack on :5433/:6380).

## Decisions and constraints

- Public pages use PublicScope (follows OS light/dark), like AuthScope on sign-in.
- Local stack: rd-pg 127.0.0.1:55470, rd-redis 127.0.0.1:56470, dev server :3031, dummy gitignored .env.

## Blockers

- None.

## Next action

- Owner review of FEATURE.md open questions; after 17.11.2026 decide on PR into main.
