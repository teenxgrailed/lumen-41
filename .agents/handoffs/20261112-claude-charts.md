---
id: 20261112-claude-charts
owner: claude
branch: feat/charts
status: active
updated: 2026-11-12T22:30:00Z
objective: Chart blocks on projects and Home (progress, habit streaks, time spent), reachable through REST and MCP
---

## Scope

- Governing plan/spec: `openspec/changes/add-charts/`, Needt task cmvzdu0mo069hqa01s727jhbg
- In scope: `Chart` model + migration, ops `chart.*`, `/api/charts`, MCP tools, project and Home UI, tests, docs
- Out of scope: phone UI, "any field over time", merge to main (product freeze until the 17.11.2026 launch)

## Completed

- See `git log main..feat/charts` and `FEATURE.md`.

## Working state

- Feature branch only; nothing merged. Local Docker: `needt-charts-pg` (127.0.0.1:55441), `needt-charts-redis` (127.0.0.1:56381); dummy `.env` (gitignored).
- Foreign changes that must remain untouched: other worktrees' containers (`lt-pg`, `rm-pg`, `rm-redis`).

## Verification

- Passed: `npm run type-check`, eslint on touched dirs, full `npm run test:unit`, migration applied to local Postgres with an empty `prisma migrate diff`.
- Not run / still required: see `FEATURE.md` (e2e status).

## Decisions and constraints

- Hand-drawn SVG (the codebase already draws `Sparkline` this way), no chart library.
- Series derived on read; the block stores only what to measure.
- Ops pattern copied from goals so REST, connector ops and MCP share one code path with undo.

## Blockers

- None. Merge waits for the owner after the launch freeze.

## Next action

- Owner review of FEATURE.md open questions; then a PR from `feat/charts` after 17.11.2026.
