---
id: 20261115-claude-idle-tab-cpu
owner: claude
branch: perf/idle-tab-cpu
status: active
updated: 2026-11-15T19:00:00Z
objective: An idle open Needt tab uses about 0 percent CPU and does not grow memory.
---

## Scope

- Governing plan/spec: owner report 15.11 ("my Mac lags when use.needt.app is left open"); docs/handoff/PORT.md (pause motion, never delete it).
- In scope: one shared idle/visibility state (`src/lib/needt3/page-activity.ts`), CSS animation pause on it, AgentsMap / ChatWave / ExposureWordmark loops, visible-only focus clock.
- Out of scope: sky-engine (already rests on its own detector), polling intervals (React Query already pauses hidden), design changes.

## Completed

- None yet (commit pending).

## Working state

- Files expected to change: the files in the PR.
- Foreign changes that must remain untouched: none.

## Verification

- Passed: type-check, eslint on changed files, jest on affected folders.
- Not run / still required: CI.

## Decisions and constraints

- One hook, not per-component: `onPageActive` / `usePageActive` / `data-needt-idle` on html.
- Idle threshold is the sky's REST_MS (12 s) so the whole app rests together.
- Measured on Contabo with throwaway Postgres/Redis containers `idle-pg`, `idle-redis` and ~/perf-idle (to be removed).

## Blockers

- `None`

## Next action

- Review and merge the PR after green CI.
